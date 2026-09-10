/**
 * @agentxm/workspace-operations deterministic test layers.
 *
 * In-memory implementations of this package's own ports for tests and
 * executable specifications. Production source never imports this module.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Layer from "effect/Layer";

import { ConfiguredAgentOutcomesProvider } from "@agentxm/workspace-state";
import { ConfiguredAgentOutcomesProviderTest } from "@agentxm/workspace-state/testing";
import { FootprintRecorder, makeFootprintRecorder } from "@agentxm/workspace-transactions";
import { OperationJournal, makeOperationJournal } from "./plan/operation-journal.js";

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
 * Every per-invocation service `previewOrApplyPlan` acquires that the CLI's
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

export {
  ResolvePlanInteractionTest,
  type ResolvePlanInteractionTestState,
} from "./plan/resolve-plan-interaction.js";
export {
  interactiveOnlyPlanExecution,
  preapprovedPlanExecution,
  promptablePlanExecution,
} from "./plan/plan-execution-fixtures.js";
