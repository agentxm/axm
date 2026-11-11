/** The lifecycle closes its own services and preserves the body's dependencies. */
import type { OperationJournal } from "@agentxm/workspace-kernel/operations";
import type { PlanSources } from "@agentxm/workspace-kernel/planning";
import type { FootprintRecorder } from "@agentxm/workspace-kernel/settlement";
import type * as Effect from "effect/Effect";
import type { OperationInvocation } from "./cli-runtime/operation-invocation.js";
import type { withOperationLifecycle } from "./operation-lifecycle.js";

type OwnedRequirements = OperationJournal | OperationInvocation | FootprintRecorder;
type WrappedRequirements = Effect.Services<
  ReturnType<typeof withOperationLifecycle<void, never, PlanSources | OwnedRequirements>>
>;

const _retainsBodyRequirements = true as const satisfies PlanSources extends WrappedRequirements
  ? true
  : false;
const _providesOwnedRequirements = true as const satisfies [
  Extract<WrappedRequirements, OwnedRequirements>,
] extends [never]
  ? true
  : false;

export type OperationLifecycleRequirements = [
  typeof _retainsBodyRequirements,
  typeof _providesOwnedRequirements,
];
