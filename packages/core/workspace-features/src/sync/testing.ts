/**
 * @agentxm/workspace/reconciliation/sync deterministic test ports.
 *
 * A reconciliation runs over a real workspace and the real per-type managers,
 * so this module does not answer for those. What it supplies is the
 * plan-invocation services every sync plan opens once per run, with the
 * kernel's structural step-failure conversion, and the request a sweep is
 * admitted with. Production source never imports this module.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import type { ConfiguredAgentOutcomesProvider } from "@agentxm/workspace-kernel/workspace-state";
import { ConfiguredAgentOutcomesProviderTest } from "@agentxm/workspace-kernel/workspace-state/testing";
import type { FootprintRecorder } from "@agentxm/workspace-kernel/settlement";
import type {
  OperationJournal,
  ResolvePlanInteraction,
} from "@agentxm/workspace-kernel/operations";
import {
  PlanInvocationTest,
  ResolvePlanInteractionTest,
} from "@agentxm/workspace-kernel/planning/testing";

import type { StepFailureConversion } from "@agentxm/workspace-kernel/reconciliation";
import { StepFailureConversionTest } from "@agentxm/workspace-kernel/reconciliation/testing";
import type { SyncWorkspaceRequest } from "./sync-workspace.js";

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
    | StepFailureConversion
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
      StepFailureConversionTest,
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
