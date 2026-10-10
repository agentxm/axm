/**
 * Rendering for whole-extension Registry visibility. Intent resolution, the
 * revision precondition, and authority kind belong to
 * `@agentxm/workspace-features/publishing`; this module parses inputs and renders.
 */

import * as Effect from "effect/Effect";

import {
  emitResult,
  paragraphDoc,
  successDoc,
  tableDoc,
  type ViewColumn,
} from "../../screen/index.js";
import {
  VisibilityEvaluationSchema,
  type VisibilityMutationResult,
} from "@agentxm/registry-protocol/unstable/publish";
import {
  ManagePublishedVisibility,
  RegistryTransitionSchema,
  registryTransition,
} from "@agentxm/workspace-features/publishing";
import type { ExtensionVisibility } from "@agentxm/extension-model/unstable/extensions";
import { failureToAppError } from "../../app-error/conversions.js";
import { withLiveOperation } from "../../operation-lifecycle.js";

interface VisibilityRow {
  readonly field: string;
  readonly value: string;
}

const visibilityColumns: ReadonlyArray<ViewColumn<VisibilityRow>> = [
  { header: "Field", value: (row) => row.field },
  { header: "Value", value: (row) => row.value },
];

const emitEvaluation = (evaluation: typeof VisibilityEvaluationSchema.Type) =>
  Effect.gen(function* () {
    yield* emitResult(evaluation, VisibilityEvaluationSchema, () => [
      ...tableDoc(
        [
          { field: "Extension", value: evaluation.target },
          { field: "Intended", value: evaluation.intent?.value ?? "not configured" },
          { field: "Actual", value: evaluation.actual?.value ?? "not established" },
          { field: "Comparison", value: evaluation.comparison },
          { field: "Source", value: evaluation.intent?.source ?? "-" },
        ],
        visibilityColumns,
      ),
      ...evaluation.findings.flatMap((finding) =>
        paragraphDoc(`${finding.severity.toUpperCase()}: ${finding.message}`),
      ),
    ]);
  });

const emitMutation = (
  action: "visibility-set" | "visibility-reconcile",
  registry: string,
  result: VisibilityMutationResult,
) =>
  Effect.gen(function* () {
    yield* emitResult(
      registryTransition({
        action,
        registry,
        fqn: result.target,
        before: result.before,
        after: result.after,
        disposition: result.result === "already-satisfied" ? "already-current" : "changed",
        revision: result.revision,
        message:
          result.result === "already-satisfied"
            ? `${result.target} is already ${result.after}.`
            : `Changed ${result.target} from ${result.before} to ${result.after}.`,
      }),
      RegistryTransitionSchema,
      () => [
        ...successDoc(
          result.result === "already-satisfied"
            ? `${result.target} is already ${result.after}.`
            : `Changed ${result.target} from ${result.before} to ${result.after}.`,
        ),
        ...paragraphDoc(`Revision: ${result.revision}`),
      ],
    );
  });

export const handleVisibilityStatus = Effect.fn("Visibility.status")(
  function* (target: string) {
    yield* emitEvaluation(
      yield* withLiveOperation(
        { command: "visibility.status", name: `Inspect visibility of ${target}`, mode: "query" },
        ManagePublishedVisibility.status(target),
      ),
    );
  },
  Effect.mapError(failureToAppError),
  Effect.asVoid,
);

export const handleVisibilitySet = Effect.fn("Visibility.set")(
  function* (target: string, visibility: ExtensionVisibility) {
    const written = yield* withLiveOperation(
      { command: "visibility.set", name: `Set visibility of ${target}`, mode: "apply" },
      ManagePublishedVisibility.set({
        target,
        visibility,
      }),
    );
    yield* emitMutation("visibility-set", written.registry, written.mutation);
  },
  Effect.mapError(failureToAppError),
  Effect.asVoid,
);

export const handleVisibilityReconcile = Effect.fn("Visibility.reconcile")(
  function* (target: string) {
    const written = yield* withLiveOperation(
      { command: "visibility.reconcile", name: `Reconcile visibility of ${target}`, mode: "apply" },
      ManagePublishedVisibility.reconcile({
        target,
      }),
    );
    yield* emitMutation("visibility-reconcile", written.registry, written.mutation);
  },
  Effect.mapError(failureToAppError),
  Effect.asVoid,
);
