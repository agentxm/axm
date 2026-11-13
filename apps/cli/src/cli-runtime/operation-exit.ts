/**
 * Operation exit code transport.
 *
 * Result producers record their semantic completion here. The runtime honors
 * that exit mapping, and carries bootstrap or delivery failures separately so
 * command dispatch cannot lose them or invent an operation settlement.
 */

import type { CommandSettlementFailure } from "./telemetry.js";
import type { OperationMode, SettledOutcome } from "@agentxm/workspace-kernel/operations";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as ServiceMap from "effect/Context";

export interface OperationSettlement {
  readonly mode: OperationMode;
  readonly outcome: SettledOutcome;
  readonly exitCode: number;
  readonly failure?: CommandSettlementFailure;
}

export class OperationExit extends ServiceMap.Service<
  OperationExit,
  {
    readonly ref: Ref.Ref<Option.Option<OperationSettlement>>;
    readonly processExitCode: Ref.Ref<Option.Option<number>>;
  }
>()("axm.sh/cli-runtime/operation-exit/OperationExit") {}

export const makeOperationExit = Effect.gen(function* () {
  return {
    ref: yield* Ref.make(Option.none<OperationSettlement>()),
    processExitCode: yield* Ref.make(Option.none<number>()),
  };
});

/** Record the exit code the operation's outcome mapped to. No-op when absent. */
export const setOperationSettlement = (settlement: OperationSettlement): Effect.Effect<void> =>
  Effect.gen(function* () {
    const service = yield* Effect.serviceOption(OperationExit);
    if (Option.isNone(service)) return;
    yield* Ref.set(service.value.ref, Option.some(settlement));
  });

export const getOperationSettlement: Effect.Effect<Option.Option<OperationSettlement>> = Effect.gen(
  function* () {
    const service = yield* Effect.serviceOption(OperationExit);
    if (Option.isNone(service)) return Option.none();
    return yield* Ref.get(service.value.ref);
  },
);

/** Record an acknowledged terminal result or a classified process failure. */
export const recordProcessExitCode = (exitCode: number): Effect.Effect<void> =>
  Effect.gen(function* () {
    const service = yield* Effect.serviceOption(OperationExit);
    if (Option.isSome(service))
      yield* Ref.set(service.value.processExitCode, Option.some(exitCode));
  });

export const OperationExitLive: Layer.Layer<OperationExit> = Layer.effect(
  OperationExit,
  makeOperationExit,
);

/** Bootstrap/delivery exits need no invented operation mode or settlement. */
export const getOperationExitCode: Effect.Effect<Option.Option<number>> = Effect.gen(function* () {
  const service = yield* Effect.serviceOption(OperationExit);
  if (Option.isNone(service)) return Option.none();
  const processExit = yield* Ref.get(service.value.processExitCode);
  if (Option.isSome(processExit)) return processExit;
  return Option.map(yield* Ref.get(service.value.ref), (settlement) => settlement.exitCode);
});
