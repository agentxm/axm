/**
 * @agentxm/workspace-sync deterministic test ports.
 *
 * A reconciliation runs over a real workspace and the real per-type managers,
 * so this module does not answer for those. What it supplies is the part the
 * application owns and a specification therefore cannot borrow from the
 * feature: the conversion from sync's typed failures into the kernel's
 * `StepFailure`, the plan-invocation services every sync plan opens once per
 * run, and the request a sweep is admitted with.
 *
 * The conversion here preserves the failure's own category and detail rather
 * than inventing wording, so an example asserting on a refused step reads the
 * feature's sentence and not a rehearsal of the CLI's renderer. Production
 * source never imports this module.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import type { ConfiguredAgentOutcomesProvider } from "@agentxm/workspace-state";
import { ConfiguredAgentOutcomesProviderTest } from "@agentxm/workspace-state/testing";
import type { FootprintRecorder } from "@agentxm/workspace-transactions";
import {
  OPERATION_ERROR_CATEGORIES,
  OperationJournal,
  StepFailure,
  type OperationErrorCategory,
  type ResolvePlanInteraction,
} from "@agentxm/workspace-operations";
import {
  PlanInvocationTest,
  ResolvePlanInteractionTest,
} from "@agentxm/workspace-operations/testing";

import { SyncStepFailureConversion, type SyncPolicyFailure } from "./failure-adapter.js";
import type { SyncWorkspaceRequest } from "./sync-workspace.js";

const isCategory = (value: unknown): value is OperationErrorCategory =>
  typeof value === "string" &&
  OPERATION_ERROR_CATEGORIES.some((category): boolean => category === value);

/**
 * The failure's own category and detail, carried through structurally.
 *
 * Every failure in `SyncPolicyFailure` already names why it refused and in
 * what sentence; a test conversion that replaced either would make the
 * example assert on the conversion instead of on the feature. A failure that
 * carries neither becomes an `internal` step failure with its own string
 * form, which is a visible defect rather than a silent default.
 */
export const structuralSyncStepFailure = (failure: SyncPolicyFailure): StepFailure => {
  const carried: unknown = failure;
  const detail =
    typeof carried === "object" &&
    carried !== null &&
    "detail" in carried &&
    typeof carried.detail === "string"
      ? carried.detail
      : String(carried);
  const category =
    typeof carried === "object" && carried !== null && "category" in carried
      ? carried.category
      : undefined;
  return new StepFailure({
    category: isCategory(category) ? category : "internal",
    detail,
    cause: failure,
  });
};

/** The application-owned conversion, bound to {@link structuralSyncStepFailure}. */
export const SyncStepFailureConversionTest: Layer.Layer<SyncStepFailureConversion> = Layer.succeed(
  SyncStepFailureConversion,
  { toStepFailure: structuralSyncStepFailure },
);

/**
 * The services every sync run opens once per invocation, plus the interaction
 * a plan presents through and the generic configured-agent outcomes.
 *
 * A preview must never ask a person to confirm, so the interaction records
 * what it was asked and answers without one; the recorded calls are evidence
 * an example asserts on directly rather than inferring from output.
 */
export interface SyncPortsTest {
  readonly layer: Layer.Layer<
    | ConfiguredAgentOutcomesProvider
    | FootprintRecorder
    | OperationJournal
    | ResolvePlanInteraction
    | SyncStepFailureConversion
  >;
  /** Every plan presentation and confirmation the run asked for. */
  readonly interaction: ReturnType<typeof ResolvePlanInteractionTest>["state"];
}

/** Compose the non-workspace services a reconciliation keeps in `R`. */
export const makeSyncPortsTest = (): SyncPortsTest => {
  const interaction = ResolvePlanInteractionTest();
  return {
    layer: Layer.mergeAll(
      PlanInvocationTest,
      interaction.layer,
      ConfiguredAgentOutcomesProviderTest,
      SyncStepFailureConversionTest,
    ),
    interaction: interaction.state,
  };
};

/**
 * A whole-workspace sweep: no single target and no type filter. Override
 * `target` or `type` for the narrowed forms `axm sync` admits.
 */
export const syncRequest = (
  overrides: Partial<SyncWorkspaceRequest> = {},
): SyncWorkspaceRequest => ({
  target: Option.none(),
  type: Option.none(),
  ...overrides,
});
