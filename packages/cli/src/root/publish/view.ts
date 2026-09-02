import * as Effect from "effect/Effect";

import { formatFqn } from "@agentxm/extension-model/unstable/extensions";
import type { PublishVisibility } from "@agentxm/registry-protocol/unstable/publish";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import { Verbosity } from "../../cli-flags/index.js";
import {
  Screen,
  bytes,
  count,
  errorDoc,
  headlineDoc,
  publishDisposition,
  publishParticipation,
  publishReason,
  successDoc,
} from "../../screen/index.js";
import type { PublishResult, PublishResultItem } from "./result.js";

const publishIdentity = (item: PublishResultItem): string => {
  const fqn = formatFqn({ owner: item.owner, type: item.type, name: item.name });
  return item.version === undefined ? fqn : `${fqn}@${item.version}`;
};

export const publishBrowserSuggestions = (result: PublishResult): ReadonlyArray<SuggestedAction> =>
  result.execution.outcomes.flatMap((item) =>
    item.links === undefined ? [] : [{ description: "View in browser", url: item.links.html }],
  );

const unreachable = (value: never): never => {
  throw new Error(`Unrecognized publish vocabulary: ${String(value)}`);
};

const publishVisibilityLine = (visibility: PublishVisibility): string => {
  const disposition = visibility.disposition === "establish" ? "set from" : "preserved from";
  const visibilitySource = visibility.source;
  const source = (() => {
    switch (visibilitySource) {
      case "manifest":
        return "the manifest";
      case "workspace":
        return "workspace settings";
      case "explicit":
        return "the command";
      case "account":
        return "account settings";
      case "platform":
        return "platform defaults";
      case "existing":
        return "the existing publication";
      default:
        return unreachable(visibilitySource);
    }
  })();
  return `visibility: ${visibility.value} (${disposition} ${source})`;
};

const publishStatus = (status: PublishResultItem["status"]): string => {
  switch (status) {
    case "success":
      return "succeeded";
    case "failed":
      return "failed";
    case "pending":
      return "pending";
    case "blocked":
      return "blocked";
    case "skipped":
      return "skipped";
    case "unknown":
      return "settlement unknown";
    default:
      return unreachable(status);
  }
};

const publishPhase = (phase: PublishResultItem["phase"]): string => {
  switch (phase) {
    case "selection":
      return "selection";
    case "authoritative_preflight":
      return "authoritative preflight";
    case "authorization":
      return "authorization";
    case "dependency_execution":
      return "dependency execution";
    case "upload_execution":
      return "upload";
    default:
      return unreachable(phase);
  }
};

const publicationSetStatus = (status: PublishResult["publicationSet"]["status"]): string => {
  switch (status) {
    case "admitted":
      return "ready";
    case "blocked":
      return "blocked";
    case "unavailable":
      return "unavailable";
    default:
      return unreachable(status);
  }
};

const publishItemLine = (item: PublishResultItem): string => {
  const identity = publishIdentity(item);
  const withVisibility =
    item.visibility === undefined
      ? identity
      : `${identity} — ${publishVisibilityLine(item.visibility)}`;
  return item.links === undefined ? withVisibility : `${withVisibility}\n${item.links.html}`;
};

const publishOutcomeLine = (item: PublishResultItem): string =>
  `${publishItemLine(item)} — ${publishStatus(item.status)} during ${publishPhase(item.phase)}: ${publishReason(item.reason)}${
    item.cause?.retryable === true
      ? ` (retryable; attempts exhausted${
          item.cause.attemptCount === undefined || item.cause.maxAttempts === undefined
            ? ""
            : `: ${item.cause.attemptCount}/${item.cause.maxAttempts}`
        })`
      : item.cause === undefined
        ? ""
        : " (terminal)"
  }${item.message === undefined ? "" : `: ${item.message}`}`;

export const renderHumanPublishResult = (
  screen: typeof Screen.Service,
  result: PublishResult,
  options: {
    readonly suggestions: ReadonlyArray<SuggestedAction>;
    readonly withoutSuggestions?: boolean;
  },
) =>
  Effect.gen(function* () {
    const verbosity = yield* Verbosity;
    if (verbosity.level === "quiet") return;

    for (const precondition of result.execution.preconditions ?? []) {
      if (precondition.status === "unmet") {
        yield* screen.note(
          headlineDoc(
            "warn",
            `${precondition.label}: ${precondition.detail ?? "Required before apply"}`,
          ),
        );
      }
    }

    const omittedDecisions = result.selection.decisions.filter(
      (decision) => decision.disposition !== "included",
    );
    if (omittedDecisions.length > 0) {
      yield* screen.note(
        headlineDoc(
          "info",
          `Selection decisions (${result.selection.counts.included} included; ${omittedDecisions.length} not included)\n${omittedDecisions
            .map(
              (decision) =>
                `${decision.id} — ${publishDisposition(decision.disposition)}: ${publishReason(decision.reason)}${
                  decision.referencedBy.length === 0
                    ? ""
                    : `; referenced by ${decision.referencedBy.join(", ")}`
                }`,
            )
            .join("\n")}`,
        ),
      );
    }
    if (result.publicationSet.items.length > 0) {
      yield* screen.note(
        headlineDoc(
          "info",
          `Authoritative publication set (${publicationSetStatus(result.publicationSet.status)})\n${result.publicationSet.items
            .map(
              (item) =>
                `${item.id}@${item.version} — ${publishParticipation(item.participation)}; dependency order ${item.dependencyOrder}`,
            )
            .join("\n")}`,
        ),
      );
    }

    for (const finding of result.execution.outcomes.flatMap((item) => item.findings ?? [])) {
      yield* screen.note(
        headlineDoc(
          "warn",
          finding.ruleId === "publish/required-pack-version-unreachable"
            ? `Required pack compatibility review: ${finding.message}`
            : finding.message,
        ),
      );
    }
    for (const item of result.execution.outcomes) {
      const source = item.sourceState;
      if (source === undefined) continue;
      const revision = source.revision === undefined ? "no HEAD" : source.revision.slice(0, 12);
      const message =
        source.status === "matches-head"
          ? `Source ${publishIdentity(item)} matches Git HEAD ${revision} at ${source.directory}`
          : `Source ${publishIdentity(item)} is not represented by Git HEAD (${revision}); ${source.differenceCount} archive ${source.differenceCount === 1 ? "path differs" : "paths differ"}`;
      yield* screen.note(headlineDoc(source.status === "matches-head" ? "info" : "warn", message));
      if (verbosity.level === "verbose" && source.differences.length > 0) {
        yield* screen.note(
          headlineDoc(
            "info",
            source.differences.map(({ path, change }) => `${change} ${path}`).join("\n"),
          ),
        );
      }
    }
    for (const item of result.execution.outcomes) {
      if (item.archive === undefined) continue;
      yield* screen.note(
        headlineDoc(
          "info",
          `Archive ${publishIdentity(item)} — ${item.archive.includedCount} included, ${item.archive.excludedCount} excluded, ${bytes(item.archive.uncompressedBytes)} source, ${bytes(item.archive.zipBytes)} ZIP`,
        ),
      );
      for (const warning of item.archive.warnings) {
        yield* screen.note(headlineDoc("warn", warning));
      }
      if (verbosity.level === "verbose") {
        const inventory = [
          ...item.archive.included.map((file) => `include ${file.path} (${file.size} bytes)`),
          ...item.archive.excluded.map(
            (file) =>
              `exclude ${file.path} (${file.size} bytes) — ${file.matchedPatterns.join(", ")}`,
          ),
        ];
        if (inventory.length > 0) {
          yield* screen.note(headlineDoc("info", inventory.join("\n")));
        }
      }
    }
    for (const finding of result.publicationSet.findings) {
      if (finding.severity === "error") yield* screen.note(errorDoc(finding.message));
      else yield* screen.note(headlineDoc("warn", finding.message));
    }

    const published = result.execution.outcomes.filter(
      (item) => item.action === "publish" && item.status === "success",
    );
    const publishable = result.execution.outcomes.filter((item) => item.action === "publish");
    const verifiedExisting = result.execution.outcomes.filter(
      (item) => item.action === "skip" && item.reason === "version_already_published",
    );
    const skipped = result.execution.outcomes.filter(
      (item) => item.action === "skip" && item.reason !== "version_already_published",
    );
    const blocked = result.execution.outcomes.filter((item) => item.status === "blocked");
    const failed = result.execution.outcomes.filter((item) => item.status === "failed");
    const suggestions =
      options.suggestions.length === 0
        ? undefined
        : {
            suggestions: options.suggestions,
            ...(options.withoutSuggestions === undefined
              ? {}
              : { withoutSuggestions: options.withoutSuggestions }),
          };

    if (result.execution.outcomes.length === 0) {
      yield* screen.result(successDoc("No extensions selected for publishing", suggestions));
      return;
    }

    if (result.execution.failure !== undefined) {
      yield* screen.note(
        errorDoc(`Publish failed: ${result.execution.failure.message}`, suggestions),
      );
      if (blocked.length > 0) {
        yield* screen.note(
          headlineDoc(
            "warn",
            `${count(blocked.length, "extension")} not attempted\n${blocked
              .map(publishOutcomeLine)
              .join("\n")}`,
          ),
        );
      }
      return;
    }

    if (result.mode === "preview") {
      const previewItems = publishable.filter(
        (item) => item.status !== "failed" && item.status !== "blocked",
      );
      if (previewItems.length > 0) {
        const [previewItem] = previewItems;
        const headline =
          previewItem !== undefined && previewItems.length === 1
            ? `Would publish ${publishItemLine(previewItem)}`
            : `Would publish ${count(previewItems.length, "extension")}`;
        const summary =
          previewItems.length <= 1
            ? undefined
            : previewItems.map((item) => publishItemLine(item)).join("\n");
        const previewOptions = {
          ...(summary === undefined ? {} : { summary }),
          ...(suggestions ?? {}),
        };
        yield* screen.result(successDoc(headline, previewOptions));
      } else if (verifiedExisting.length > 0 && failed.length === 0 && blocked.length === 0) {
        yield* screen.result(
          successDoc(
            `All ${verifiedExisting.length} selected versions are already published and integrity-verified`,
            {
              summary: verifiedExisting.map((item) => publishItemLine(item)).join("\n"),
              ...(suggestions ?? {}),
            },
          ),
        );
      }
      if (
        verifiedExisting.length > 0 &&
        (previewItems.length > 0 || failed.length > 0 || blocked.length > 0)
      ) {
        yield* screen.note(
          headlineDoc(
            "info",
            `${count(verifiedExisting.length, "version")} already published and integrity-verified\n${verifiedExisting
              .map((item) => publishItemLine(item))
              .join("\n")}`,
          ),
        );
      }
      if (failed.length > 0) {
        yield* screen.note(errorDoc(`${count(failed.length, "extension")} failed preflight`));
      }
      if (blocked.length > 0) {
        yield* screen.note(
          headlineDoc("warn", `${count(blocked.length, "extension")} not attempted`),
        );
      }
      return;
    }

    if (published.length > 0 && failed.length === 0) {
      const [publishedItem] = published;
      const headline =
        publishedItem !== undefined && published.length === 1
          ? `Published ${publishItemLine(publishedItem)}`
          : `Published ${count(published.length, "extension")}`;
      const summary =
        published.length <= 1
          ? undefined
          : published.map((item) => publishItemLine(item)).join("\n");
      yield* screen.result(
        successDoc(headline, {
          ...(summary === undefined ? {} : { summary }),
          ...(suggestions ?? {}),
        }),
      );
      if (verifiedExisting.length > 0) {
        yield* screen.note(
          headlineDoc(
            "info",
            `${count(verifiedExisting.length, "version")} already published and integrity-verified\n${verifiedExisting
              .map((item) => publishItemLine(item))
              .join("\n")}`,
          ),
        );
      }
      return;
    }

    if (published.length > 0) {
      const headline = `Published ${count(published.length, "extension")}; ${count(failed.length, "extension")} failed; ${count(blocked.length, "extension")} not attempted`;
      yield* screen.note(errorDoc(headline, suggestions));
      yield* screen.note(
        headlineDoc(
          "info",
          [
            ...published.map((item) => publishItemLine(item)),
            ...failed.map(publishOutcomeLine),
            ...blocked.map(publishOutcomeLine),
          ].join("\n"),
        ),
      );
      if (verifiedExisting.length > 0) {
        yield* screen.note(
          headlineDoc(
            "info",
            `${count(verifiedExisting.length, "version")} already published and integrity-verified\n${verifiedExisting
              .map((item) => publishItemLine(item))
              .join("\n")}`,
          ),
        );
      }
      return;
    }

    if (failed.length > 0) {
      const [failedItem] = failed;
      const failureLabel = failed.some((item) => item.phase === "upload_execution")
        ? "Publish failed"
        : "Publish preflight failed";
      const headline =
        failedItem !== undefined && failed.length === 1
          ? `${failureLabel} for ${publishIdentity(failedItem)}`
          : `${failureLabel} for ${count(failed.length, "extension")}`;
      yield* screen.note(errorDoc(headline, suggestions));
      yield* screen.note(headlineDoc("info", failed.map(publishOutcomeLine).join("\n")));
      if (verifiedExisting.length > 0) {
        yield* screen.note(
          headlineDoc(
            "info",
            `${count(verifiedExisting.length, "version")} already published and integrity-verified\n${verifiedExisting
              .map((item) => publishItemLine(item))
              .join("\n")}`,
          ),
        );
      }
      if (blocked.length > 0) {
        yield* screen.note(
          headlineDoc(
            "warn",
            `${count(blocked.length, "extension")} ready but not attempted\n${blocked
              .map(publishOutcomeLine)
              .join("\n")}`,
          ),
        );
      }
      return;
    }

    const [verifiedItem] = verifiedExisting;
    const headline =
      verifiedItem !== undefined && verifiedExisting.length === 1 && skipped.length === 0
        ? `Already published and integrity-verified — ${publishItemLine(verifiedItem)}`
        : verifiedExisting.length > 0
          ? `All ${verifiedExisting.length} selected versions are already published and integrity-verified`
          : `No extensions published — ${count(skipped.length, "extension")} skipped`;
    yield* screen.result(
      successDoc(headline, {
        ...(verifiedExisting.length > 1
          ? { summary: verifiedExisting.map((item) => publishItemLine(item)).join("\n") }
          : {}),
        ...(suggestions ?? {}),
      }),
    );
  });
