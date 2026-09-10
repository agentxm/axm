/**
 * Emission of the publish result document.
 *
 * The `publish-result-v3` contract, its counts, and its execution status are
 * owned by `@agentxm/extension-publish`; this module renders that outcome —
 * machine document or human view — and summarizes it for telemetry.
 */

import * as Effect from "effect/Effect";

import { PublishResultSchema, type PublishResult } from "@agentxm/extension-publish";
import { type SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

import { Screen } from "../../screen/index.js";
import {
  type CommandOutcomeSummary,
  type SubjectType,
  getCommandSemanticProperties,
  setCommandSemanticProperties,
  summarizeCommandOutcome,
} from "../../cli-runtime/index.js";
import { publishBrowserSuggestions, renderHumanPublishResult } from "./view.js";

export const emitPublishResult = <TCommand extends string>(
  _command: TCommand,
  result: PublishResult,
  options?: {
    readonly summary?: string;
    readonly suggestions?: ReadonlyArray<SuggestedAction>;
    readonly withoutSuggestions?: boolean;
  },
) =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    const browserSuggestions = publishBrowserSuggestions(result);
    const findingSuggestions = result.execution.outcomes.flatMap((item) =>
      (item.findings ?? []).flatMap((finding) => finding.suggestions),
    );
    const suggestions = [
      ...(options?.suggestions ?? []),
      ...(result.recovery === undefined ? [] : [result.recovery]),
      ...result.publicationSet.findings.flatMap((finding) => finding.suggestions),
      ...findingSuggestions,
      ...browserSuggestions,
    ];
    const summary = publishResultToSummary(result);
    const renderOptions = {
      ...(options?.summary === undefined ? {} : { summary: options.summary }),
      ...(suggestions.length === 0 ? {} : { suggestions }),
      ...(options?.withoutSuggestions === undefined
        ? {}
        : { withoutSuggestions: options.withoutSuggestions }),
      ok:
        result.execution.status !== "failed" &&
        result.execution.status !== "partial" &&
        result.execution.failure === undefined &&
        summary.failedCount === 0,
    };
    const existingSemanticProperties = yield* getCommandSemanticProperties;
    yield* setCommandSemanticProperties({
      ...existingSemanticProperties,
      ...summarizeCommandOutcome(summary),
    });
    const emitted = yield* screen.document(result, PublishResultSchema, renderOptions);
    if (!emitted) {
      yield* renderHumanPublishResult(screen, result, {
        ok: renderOptions.ok,
        suggestions,
        ...(options?.withoutSuggestions === undefined
          ? {}
          : { withoutSuggestions: options.withoutSuggestions }),
      });
    }
    return emitted;
  });

/**
 * Convert a PublishResult to a CommandOutcomeSummary for telemetry.
 *
 * Outcome follows the same convention as executed plans: a run that touched
 * nothing is `no-op`, and any applied or failed work is `applied` even when
 * every item failed, so partial failures stay in one bucket.
 *
 * Unconfirmed work is not "touched nothing": an indeterminate upload joins the
 * failed bucket because its settlement is unproven and needs attention, and an
 * item that never left the process joins the blocked bucket. Either keeps the
 * run out of `no-op`. An interrupted run still reports `interrupted`.
 */
export const publishResultToSummary = (result: PublishResult): CommandOutcomeSummary => {
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
  };
};
