/**
 * @agentxm/workspace/transitions/planning deterministic test layers.
 *
 * In-memory implementations of this package's own ports for tests and
 * executable specifications. Production source never imports this module.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { ConfiguredAgentOutcomesProvider } from "../../desired-state/index.js";
import { ConfiguredAgentOutcomesProviderTest } from "../../desired-state/testing.js";
import { FootprintRecorder, makeFootprintRecorder } from "../settlement/index.js";
import {
  OperationJournal,
  ResolvePlanInteraction,
  makeOperationJournal,
  type ApplyConfirmation,
  type ConfirmationRecovery,
  type Plan,
  type PlanInteractionFailed,
  type ResolvePlanInteractionService,
} from "../../operations/index.js";

/**
 * An empty journal for one test invocation, standing in for the
 * per-invocation journal the CLI's operation lifecycle creates around every
 * command. Provide it wherever a test drives a plan directly instead of
 * through that lifecycle. A test that asserts on what was recorded should
 * build the service itself with `makeOperationJournal` and keep the ref.
 */
export const OperationJournalTest: Layer.Layer<OperationJournal> = Layer.effect(
  OperationJournal,
  makeOperationJournal,
);

/** A fresh footprint recorder for one test invocation. */
export const FootprintRecorderTest: Layer.Layer<FootprintRecorder> = Layer.effect(
  FootprintRecorder,
  makeFootprintRecorder,
);

/**
 * Every per-invocation service `resolveExecutionCandidate` acquires that the CLI's
 * operation lifecycle opens around a command: the journal, the footprint
 * recorder, and a configured-agent outcome provider with no per-type
 * refinement. A test that drives a plan directly needs all of them, so this
 * is the layer to reach for rather than assembling the three by hand.
 */
export const PlanInvocationTest: Layer.Layer<
  OperationJournal | FootprintRecorder | ConfiguredAgentOutcomesProvider
> = Layer.mergeAll(
  OperationJournalTest,
  FootprintRecorderTest,
  ConfiguredAgentOutcomesProviderTest,
);

export interface ResolvePlanInteractionTestState {
  readonly confirmApplyChangesCalls: Array<ConfirmationRecovery>;
  readonly presentPlanCalls: Array<{
    readonly planName: string;
    readonly mode: "preview" | "apply";
  }>;
}

/**
 * A recording `ResolvePlanInteraction` for tests: it answers availability and
 * confirmation from the overrides, approving by default, and records every
 * confirmation request and presented plan.
 */
export const ResolvePlanInteractionTest = (overrides?: {
  readonly isConfirmationAvailable?: boolean;
  readonly confirmApplyChanges?: (
    recovery: ConfirmationRecovery,
  ) => Effect.Effect<ApplyConfirmation, PlanInteractionFailed>;
  readonly presentPlan?: (
    plan: Plan<unknown, unknown>,
    options: { readonly mode: "preview" | "apply" },
  ) => Effect.Effect<void, PlanInteractionFailed>;
}) => {
  const state: ResolvePlanInteractionTestState = {
    confirmApplyChangesCalls: [],
    presentPlanCalls: [],
  };

  const layer = Layer.succeed(ResolvePlanInteraction, {
    isConfirmationAvailable: Effect.succeed(overrides?.isConfirmationAvailable ?? false),
    confirmApplyChanges: (recovery) =>
      Effect.gen(function* () {
        state.confirmApplyChangesCalls.push(recovery);
        return yield* overrides?.confirmApplyChanges?.(recovery) ??
          Effect.succeed("approved" as const);
      }),
    presentPlan: (plan, options) =>
      Effect.gen(function* () {
        state.presentPlanCalls.push({ planName: plan.name, mode: options.mode });
        yield* overrides?.presentPlan?.(plan, options) ?? Effect.void;
      }),
  } satisfies ResolvePlanInteractionService);

  return { layer, state };
};
export {
  interactiveOnlyPlanExecution,
  preapprovedPlanExecution,
  promptablePlanExecution,
} from "./plan/plan-execution-fixtures.js";
