import type { PublishResult } from "@agentxm/workspace/publishing";

import {
  ALREADY_PUBLISHED,
  NOT_TRIED,
  blockingClass,
  count,
  duration,
  exitPhrase,
  interruptionPhrase,
  joined,
  publishOutcome,
  type Tone,
} from "../../screen/index.js";
import {
  distinct,
  versionedPublishIdentity,
  type PlacedPublication,
  type PublishStanding,
} from "./standing.js";

/** The counts a problem verdict carries as its aside, in ledger order. */
const tally = (
  placed: ReadonlyArray<PlacedPublication>,
  exitCode: number,
): ReadonlyArray<string> => {
  const counted = (standing: PublishStanding, word: string): string | undefined => {
    const value = placed.filter((entry) => entry.standing === standing).length;
    return value === 0 ? undefined : `${String(value)} ${word}`;
  };
  return [
    counted("published", publishOutcome("published")),
    counted("failed", publishOutcome("failed")),
    counted("unconfirmed", publishOutcome("unconfirmed")),
    counted("blocked", publishOutcome("blocked")),
    counted("not-tried", NOT_TRIED),
    counted("already-published", ALREADY_PUBLISHED),
    exitCode === 0 ? undefined : exitPhrase(exitCode),
  ].filter((part): part is string => part !== undefined);
};

const visibilitySummary = (published: ReadonlyArray<PlacedPublication>): string | undefined => {
  const values = published.flatMap(({ item }) =>
    item.visibility === undefined ? [] : [item.visibility.value],
  );
  const kinds = distinct(values);
  const [only] = kinds;
  if (kinds.length === 1) return only;
  return joined(
    kinds.map((kind) => `${String(values.filter((value) => value === kind).length)} ${kind}`),
  );
};

export interface PublishVerdict {
  readonly tone: Tone;
  readonly verdict: string;
  readonly aside: ReadonlyArray<string>;
  readonly reason?: string;
  readonly blocked?: true;
  readonly alone?: true;
}

const alreadyPublishedVerdict = (existing: ReadonlyArray<PlacedPublication>): string => {
  const [only] = existing;
  return existing.length === 1 && only !== undefined
    ? `${versionedPublishIdentity(only.item)} is already published and verified`
    : `All ${String(existing.length)} selected versions are already published and verified`;
};

export const publishVerdictOf = (
  result: PublishResult,
  placed: ReadonlyArray<PlacedPublication>,
  options: { readonly exitCode: number; readonly elapsedMs?: number },
): PublishVerdict => {
  const inState = (standing: PublishStanding) =>
    placed.filter((entry) => entry.standing === standing);
  const toPublish = inState("to-publish");
  const published = inState("published");
  const existing = inState("already-published");
  const failed = inState("failed");
  const unconfirmed = inState("unconfirmed");
  const blocked = inState("blocked");
  const notTried = inState("not-tried");
  const skipped = inState("skipped");
  const problemAside = tally(placed, options.exitCode);

  if (result.interruption !== undefined) {
    return {
      tone: "error",
      verdict: interruptionPhrase(
        result.interruption.signal,
        published.length > 0 ? "retained" : unconfirmed.length > 0 ? "unknown" : "none",
      ),
      aside: problemAside,
    };
  }
  if (placed.length === 0) {
    return { tone: "ok", verdict: "No extensions selected for publishing", aside: [], alone: true };
  }
  const failure = result.execution.failure;
  if (failure !== undefined) {
    const [ownCondition] = blocked;
    return ownCondition === undefined
      ? { tone: "error", verdict: "Publish failed", aside: problemAside, reason: failure.message }
      : {
          tone: "warn",
          verdict: `Publish is blocked — ${blockingClass(
            ownCondition.item.reason === "source_state_not_accepted"
              ? "override-required"
              : "stale-candidate",
          )}`,
          aside: problemAside,
          reason: failure.message,
          blocked: true,
        };
  }
  if (result.mode === "preview") {
    if (failed.length > 0) {
      return {
        tone: "error",
        verdict: `Publish preflight failed for ${count(failed.length, "extension")}`,
        aside: ["nothing was uploaded", ...problemAside],
      };
    }
    if (toPublish.length === 0 && existing.length > 0) {
      return { tone: "ok", verdict: alreadyPublishedVerdict(existing), aside: [], alone: true };
    }
    return {
      tone: "neutral",
      verdict: `Would publish ${count(toPublish.length, "extension")}`,
      aside: [
        existing.length === 0 ? undefined : `${String(existing.length)} ${ALREADY_PUBLISHED}`,
        "nothing was uploaded",
      ].filter((part): part is string => part !== undefined),
    };
  }
  const unfinished = failed.length + unconfirmed.length + blocked.length + notTried.length;
  if (published.length > 0 && unfinished === 0) {
    return {
      tone: "ok",
      verdict: `Published ${count(published.length, "extension")}`,
      aside: [
        visibilitySummary(published),
        options.elapsedMs === undefined ? undefined : duration(options.elapsedMs),
      ].filter((part): part is string => part !== undefined),
    };
  }
  if (published.length > 0)
    return { tone: "warn", verdict: "Partially published", aside: problemAside };
  if (failed.length > 0) {
    const label = failed.some((entry) => entry.item.phase === "upload_execution")
      ? "Publish failed"
      : "Publish preflight failed";
    return {
      tone: "error",
      verdict: `${label} for ${count(failed.length, "extension")}`,
      aside: problemAside,
    };
  }
  if (unconfirmed.length > 0) {
    return {
      tone: "error",
      verdict: `Publish did not confirm ${count(unconfirmed.length, "extension")}`,
      aside: problemAside,
      reason: "Verify the target registry before publishing again.",
    };
  }
  if (existing.length > 0) {
    return { tone: "ok", verdict: alreadyPublishedVerdict(existing), aside: [], alone: true };
  }
  return {
    tone: "ok",
    verdict: `No extensions published — ${count(skipped.length, "dependency", "dependencies")} left as registry references`,
    aside: [],
    alone: true,
  };
};
