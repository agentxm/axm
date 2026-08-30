/**
 * Operation lifecycle events.
 *
 * Execution publishes typed lifecycle events — phase transitions, unit state
 * transitions, and waiting reasons, each with a monotonic timestamp — to an
 * invocation-scoped broadcast. Observers (renderers, machine progress,
 * telemetry) subscribe; none of them controls execution or keeps a second
 * account of what happened. Publishing is a no-op when no broadcast is
 * provided.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as PubSub from "effect/PubSub";
import type * as Scope from "effect/Scope";
import * as ServiceMap from "effect/Context";

import type { BlockingClass } from "./plan.js";
import type { OperationPhase, UnitState } from "./operation-resolution.js";

export type OperationLifecycleEvent =
  | {
      readonly _tag: "PhaseStarted";
      readonly phase: OperationPhase;
      readonly atNanos: bigint;
    }
  | {
      readonly _tag: "UnitStarted";
      readonly unitId: string;
      readonly label: string;
      readonly index: number;
      readonly total: number;
      readonly atNanos: bigint;
    }
  | {
      readonly _tag: "UnitResolved";
      readonly unitId: string;
      readonly label: string;
      readonly state: UnitState;
      readonly index: number;
      readonly total: number;
      readonly atNanos: bigint;
    }
  | {
      readonly _tag: "Waiting";
      readonly blockingClass: BlockingClass;
      readonly subject: string;
      readonly detail: string;
      readonly atNanos: bigint;
    };

export interface OperationLifecycleService {
  readonly mode: "preview" | "apply";
  readonly pubsub: PubSub.PubSub<OperationLifecycleEvent>;
}

export class OperationLifecycle extends ServiceMap.Service<
  OperationLifecycle,
  OperationLifecycleService
>()("@agentxm/extension-management/unstable/plan/operation-events/OperationLifecycle") {}

/** Publish one lifecycle event. No-op when no broadcast is provided. */
export const publishLifecycleEvent = (
  make: (atNanos: bigint) => OperationLifecycleEvent,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const service = yield* Effect.serviceOption(OperationLifecycle);
    if (Option.isNone(service)) return;
    const atNanos = yield* Clock.currentTimeNanos;
    yield* PubSub.publish(service.value.pubsub, make(atNanos));
  });

export const publishPhaseStarted = (phase: OperationPhase): Effect.Effect<void> =>
  publishLifecycleEvent((atNanos) => ({ _tag: "PhaseStarted", phase, atNanos }));

/**
 * Fork a subscriber that observes every lifecycle event published while the
 * scope lives. No-op (returns immediately) when no broadcast is provided.
 */
export const subscribeToLifecycle = (
  observe: (event: OperationLifecycleEvent) => Effect.Effect<void>,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function* () {
    const service = yield* Effect.serviceOption(OperationLifecycle);
    if (Option.isNone(service)) return;
    const subscription = yield* PubSub.subscribe(service.value.pubsub);
    yield* Effect.forkScoped(
      Effect.forever(PubSub.take(subscription).pipe(Effect.flatMap(observe))),
    );
  });

export const makeOperationLifecycle = (
  mode: "preview" | "apply",
): Effect.Effect<OperationLifecycleService> =>
  PubSub.unbounded<OperationLifecycleEvent>().pipe(Effect.map((pubsub) => ({ mode, pubsub })));
