/**
 * Rendering for whole-extension Registry visibility. Intent resolution, the
 * revision precondition, the authority kind, and human verification belong to
 * `@agentxm/extension-publish`; this module parses inputs and renders.
 */

import * as Effect from "effect/Effect";

import {
  Screen,
  paragraphDoc,
  successDoc,
  tableViewDoc,
  type TableView,
} from "../../screen/index.js";
import {
  VisibilityEvaluationSchema,
  VisibilityMutationResultSchema,
} from "@agentxm/registry-protocol/unstable/publish";
import { ManagePublishedVisibility } from "@agentxm/extension-publish";
import type { ExtensionVisibility } from "@agentxm/extension-model/unstable/extensions";
import { publishFailureToAppError } from "../../feature-errors.js";
import { HumanVerificationOptions, isNonInteractive, jsonFlag } from "../../cli-flags/index.js";
import * as Option from "effect/Option";

interface VisibilityRow {
  readonly field: string;
  readonly value: string;
}

const VisibilityTable = {
  columns: {
    field: { header: "Field" },
    value: { header: "Value" },
  },
} as const satisfies TableView<VisibilityRow>;

/** The invocation's human-verification inputs, as the capability reads them. */
const verificationOptions = Effect.gen(function* () {
  const { stepUpRequest, waitForHuman } = yield* HumanVerificationOptions;
  const unattended = (yield* isNonInteractive) || Option.getOrElse(yield* jsonFlag, () => false);
  return {
    ...(Option.isNone(stepUpRequest) ? {} : { resumeReference: stepUpRequest.value }),
    ...(Option.isNone(waitForHuman) ? {} : { waitForHumanSeconds: waitForHuman.value }),
    unattended,
  };
});

const emitEvaluation = (evaluation: typeof VisibilityEvaluationSchema.Type) =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    if (yield* screen.document(evaluation, VisibilityEvaluationSchema)) return;
    yield* screen.result(
      tableViewDoc(
        [
          { field: "Extension", value: evaluation.target },
          { field: "Intended", value: evaluation.intent?.value ?? "not configured" },
          { field: "Actual", value: evaluation.actual?.value ?? "not established" },
          { field: "Comparison", value: evaluation.comparison },
          { field: "Source", value: evaluation.intent?.source ?? "-" },
        ],
        VisibilityTable,
      ),
    );
    for (const finding of evaluation.findings) {
      yield* screen.note(paragraphDoc(`${finding.severity.toUpperCase()}: ${finding.message}`));
    }
  });

const emitMutation = (result: typeof VisibilityMutationResultSchema.Type) =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    if (yield* screen.document(result, VisibilityMutationResultSchema)) return;
    yield* screen.result(
      successDoc(
        result.result === "already-satisfied"
          ? `${result.target} is already ${result.after}.`
          : `Changed ${result.target} from ${result.before} to ${result.after}.`,
      ),
    );
  });

export const handleVisibilityStatus = Effect.fn("Visibility.status")(
  function* (target: string) {
    yield* emitEvaluation(yield* ManagePublishedVisibility.status(target));
  },
  Effect.mapError(publishFailureToAppError),
  Effect.asVoid,
);

export const handleVisibilitySet = Effect.fn("Visibility.set")(
  function* (target: string, visibility: ExtensionVisibility) {
    const written = yield* ManagePublishedVisibility.set({
      target,
      visibility,
      verification: yield* verificationOptions,
    });
    yield* emitMutation(written.mutation);
  },
  Effect.mapError(publishFailureToAppError),
  Effect.asVoid,
);

export const handleVisibilityReconcile = Effect.fn("Visibility.reconcile")(
  function* (target: string) {
    const written = yield* ManagePublishedVisibility.reconcile({
      target,
      verification: yield* verificationOptions,
    });
    yield* emitMutation(written.mutation);
  },
  Effect.mapError(publishFailureToAppError),
  Effect.asVoid,
);
