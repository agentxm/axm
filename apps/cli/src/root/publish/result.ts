import { publishResultFailure } from "./failure-diagnostic.js";
import { prepareTerminalFailure } from "../../cli-runtime/terminal-diagnostics.js";
import { errorClassForAppErrorCode, appErrorCodeForExit } from "../../app-error/index.js";
import * as Option from "effect/Option";
/**
 * Emission of the publish result document.
 *
 * The `publish-result-v3` contract, its counts, and its execution status are
 * owned by `@agentxm/workspace-features/publishing`; this module renders that outcome —
 * machine document or human view — and summarizes it for telemetry.
 */

import * as Effect from "effect/Effect";

import { PublishResultSchema, type PublishResult } from "@agentxm/workspace-features/publishing";
import { type SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

import { emitResult } from "../../screen/index.js";
import { type OperationRefused } from "@agentxm/workspace-kernel/operations";
import { Verbosity } from "../../cli-flags/index.js";
import {
  type CommandOutcomeSummary,
  type SubjectType,
  getCommandSemanticProperties,
  setCommandSemanticProperties,
  summarizeCommandOutcome,
} from "../../cli-runtime/index.js";
import { publishDoc } from "./view.js";
import { operationExitCode, type OperationVerdict } from "../../operation-exit-code.js";
import { completeResult, type ResultCompletion } from "../../cli-runtime/result-completion.js";

const publishBrowserSuggestions = (result: PublishResult): ReadonlyArray<SuggestedAction> =>
  result.execution.outcomes.flatMap((item) =>
    item.links === undefined ? [] : [{ description: "View in browser", url: item.links.html }],
  );

/** Settle narration before emitting the complete publication result. */
export const emitPublishResult = (
  result: PublishResult,
  options: {
    readonly verdict?: OperationVerdict;
    readonly elapsedMs?: number;
    readonly suggestions?: ReadonlyArray<SuggestedAction>;
    readonly withoutSuggestions?: boolean;
    /** Original typed settlement stays local; the result document is a projection. */
    readonly originalFailure?: OperationRefused;
  },
) =>
  Effect.gen(function* () {
    const verbosity = yield* Verbosity;
    const completion = publishCompletion(result, options.verdict);
    const code = appErrorCodeForExit(completion.exitCode);
    const failure =
      code === undefined || result.interruption !== undefined
        ? undefined
        : publishResultFailure(result, code);
    const diagnostic =
      failure === undefined
        ? Option.none()
        : yield* prepareTerminalFailure(
            {
              ...failure,
              category: failure.code,
              errorClass: errorClassForAppErrorCode(failure.code),
              command: "publish",
            },
            [
              options.originalFailure,
              result.execution.failure,
              ...result.execution.outcomes.flatMap((item) =>
                item.cause === undefined ? [] : [item.cause],
              ),
            ],
          );
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
    const summary = publishResultToSummary(result, completion);
    const withoutSuggestions =
      options.withoutSuggestions === undefined
        ? {}
        : { withoutSuggestions: options.withoutSuggestions };
    const existingSemanticProperties = yield* getCommandSemanticProperties;
    yield* setCommandSemanticProperties({
      ...existingSemanticProperties,
      ...summarizeCommandOutcome(summary),
    });
    yield* completeResult({ ...completion, ...(failure === undefined ? {} : { failure }) });
    yield* emitResult(
      result,
      PublishResultSchema,
      () =>
        publishDoc(result, {
          verbosity: verbosity.level,
          exitCode: completion.exitCode,
          suggestions,
          ...(options.elapsedMs === undefined ? {} : { elapsedMs: options.elapsedMs }),
          ...withoutSuggestions,
        }),
      {
        ...(Option.isSome(diagnostic)
          ? { diagnosticId: diagnostic.value.eventId, diagnostic: diagnostic.value.failure }
          : {}),
        ...(suggestions.length === 0 ? {} : { suggestions }),
        ...withoutSuggestions,
        completion: { ...completion, ...(failure === undefined ? {} : { failure }) },
        promotedResultFields: ["mode"],
      },
    );
    return completion;
  });

/** Derive completion from publication facts; telemetry consumes this decision. */
const publishCompletion = (
  result: PublishResult,
  verdict: OperationVerdict = {},
): ResultCompletion => {
  const applied = result.counts.published;
  const failed = result.counts.failed + (result.execution.failure === undefined ? 0 : 1);
  const pending = result.mode === "apply" ? result.counts.pending : 0;
  const blocked = result.counts.blocked + pending;
  const unknown = result.mode === "apply" ? result.counts.unknown : 0;
  const outcome: ResultCompletion["outcome"] =
    result.interruption !== undefined
      ? "interrupted"
      : unknown > 0
        ? applied > 0 ||
          result.counts.alreadyPublished > 0 ||
          result.counts.failed > 0 ||
          blocked > 0
          ? "partial"
          : "indeterminate"
        : applied > 0 && (failed > 0 || blocked > 0)
          ? "partial"
          : failed > 0
            ? verdict.blocking === undefined
              ? "failed"
              : "blocked"
            : blocked > 0
              ? "blocked"
              : result.mode === "preview"
                ? "previewed"
                : applied === 0
                  ? "no-op"
                  : "applied";
  const effectiveVerdict = {
    ...verdict,
    ...(result.interruption === undefined ? {} : { interruption: result.interruption }),
    ...(verdict.failure !== undefined || result.execution.failure === undefined
      ? {}
      : { failure: { category: result.execution.failure.code } }),
  };
  return { mode: result.mode, outcome, exitCode: operationExitCode(effectiveVerdict, outcome) };
};

/** Unknown uploads remain unknown; they are never counted as confirmed failures. */
const publishResultToSummary = (
  result: PublishResult,
  completion: ResultCompletion,
): CommandOutcomeSummary => {
  const types = new Set(result.execution.outcomes.map((item) => item.type));
  const [onlyType] = [...types];
  const subjectType: SubjectType =
    onlyType === undefined ? "unknown" : types.size === 1 ? onlyType : "mixed";
  return {
    outcome: completion.outcome,
    subjectType,
    sourceKind: "workspace",
    appliedCount: result.counts.published,
    failedCount: result.counts.failed + (result.execution.failure === undefined ? 0 : 1),
    blockedCount: result.counts.blocked + (result.mode === "apply" ? result.counts.pending : 0),
  };
};
