/**
 * Emission of the publish result document.
 *
 * The `publish-result-v3` contract, its counts, and its execution status are
 * owned by `@agentxm/workspace/publishing`; this module renders that outcome —
 * machine document or human view — and summarizes it for telemetry.
 */

import * as Effect from "effect/Effect";

import { PublishResultSchema, type PublishResult } from "@agentxm/workspace/publishing";
import { type SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

import { emitResult } from "../../screen/index.js";
import { settleOperation, awaitDrained } from "@agentxm/workspace/transitions/planning";
import { Verbosity } from "../../cli-flags/index.js";
import {
  type CommandOutcomeSummary,
  type SubjectType,
  getCommandSemanticProperties,
  setCommandSemanticProperties,
  summarizeCommandOutcome,
} from "../../cli-runtime/index.js";
import { publishDoc } from "./view.js";

const publishBrowserSuggestions = (result: PublishResult): ReadonlyArray<SuggestedAction> =>
  result.execution.outcomes.flatMap((item) =>
    item.links === undefined ? [] : [{ description: "View in browser", url: item.links.html }],
  );

/** Settle narration before emitting the complete publication result. */
export const emitPublishResult = (
  result: PublishResult,
  options: {
    readonly exitCode: number;
    readonly elapsedMs?: number;
    readonly suggestions?: ReadonlyArray<SuggestedAction>;
    readonly withoutSuggestions?: boolean;
  },
) =>
  Effect.gen(function* () {
    const verbosity = yield* Verbosity;
    const browserSuggestions = publishBrowserSuggestions(result);
    const findingSuggestions = result.execution.outcomes.flatMap((item) =>
      (item.findings ?? []).flatMap((finding) => finding.suggestions),
    );
    const suggestions = [
      ...(options.suggestions ?? []),
      ...(result.recovery === undefined ? [] : [result.recovery]),
      ...result.publicationSet.findings.flatMap((finding) => finding.suggestions),
      ...findingSuggestions,
      ...browserSuggestions,
    ];
    const summary = publishResultToSummary(result);
    const withoutSuggestions =
      options.withoutSuggestions === undefined
        ? {}
        : { withoutSuggestions: options.withoutSuggestions };
    const existingSemanticProperties = yield* getCommandSemanticProperties;
    yield* setCommandSemanticProperties({
      ...existingSemanticProperties,
      ...summarizeCommandOutcome(summary),
    });
    yield* settleOperation(summary.outcome);
    yield* awaitDrained;
    yield* emitResult(
      result,
      PublishResultSchema,
      () =>
        publishDoc(result, {
          verbosity: verbosity.level,
          exitCode: options.exitCode,
          suggestions,
          ...(options.elapsedMs === undefined ? {} : { elapsedMs: options.elapsedMs }),
          ...withoutSuggestions,
        }),
      {
        ...(suggestions.length === 0 ? {} : { suggestions }),
        ...withoutSuggestions,
        ok:
          result.execution.status !== "failed" &&
          result.execution.status !== "partial" &&
          result.execution.failure === undefined &&
          summary.failedCount === 0,
      },
    );
  });

/**
 * Convert a PublishResult to a CommandOutcomeSummary for telemetry.
 *
 * Outcome distinguishes applied, partial, failed, blocked and untouched work.
 *
 * Unconfirmed work is not "touched nothing": an indeterminate upload joins the
 * failed bucket because its settlement is unproven and needs attention, and an
 * item that never left the process joins the blocked bucket. Either keeps the
 * run out of `no-op`. An interrupted run still reports `interrupted`.
 */
export const publishResultToSummary = (result: PublishResult) => {
  const appliedCount = result.counts.published;
  // A preview leaves every selected item `pending` by construction, so only an
  // apply carries unconfirmed work.
  const unconfirmed =
    result.mode === "apply"
      ? { unknown: result.counts.unknown, pending: result.counts.pending }
      : { unknown: 0, pending: 0 };
  const failedCount =
    result.counts.failed + unconfirmed.unknown + (result.execution.failure === undefined ? 0 : 1);
  const blockedCount = result.counts.blocked + unconfirmed.pending;
  const types = new Set(result.execution.outcomes.map((item) => item.type));
  const [onlyType] = [...types];
  const subjectType: SubjectType =
    onlyType === undefined ? "unknown" : types.size === 1 ? onlyType : "mixed";
  return {
    outcome:
      result.interruption !== undefined
        ? "interrupted"
        : result.mode === "preview"
          ? "previewed"
          : appliedCount > 0 && (failedCount > 0 || blockedCount > 0)
            ? "partial"
            : failedCount > 0
              ? "failed"
              : blockedCount > 0
                ? "blocked"
                : appliedCount === 0
                  ? "no-op"
                  : "applied",
    subjectType,
    sourceKind: "workspace",
    appliedCount,
    failedCount,
    blockedCount,
  } satisfies CommandOutcomeSummary;
};
