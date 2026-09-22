import * as ServiceMap from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import type * as Scope from "effect/Scope";

/** Four maximum-size acquired trees may be active together. */
export const MAX_OPERATION_SCRATCH_BYTES = 1024 * 1024 * 1024;
export const MAX_ACQUIRED_TREE_BYTES = 256 * 1024 * 1024;

export class OperationScratchLimitExceeded extends Data.TaggedError(
  "OperationScratchLimitExceeded",
)<{
  readonly capacity: number;
  readonly requested: number;
}> {}

export interface OperationScratchReservation {
  readonly settle: (actualBytes: number) => Effect.Effect<void, OperationScratchLimitExceeded>;
}

export interface OperationScratchBudgetService {
  readonly capacity: number;
  readonly reserve: (
    maxBytes: number,
  ) => Effect.Effect<OperationScratchReservation, OperationScratchLimitExceeded, Scope.Scope>;
}

/** Shared by all source acquisitions in one CLI operation. */
export class OperationScratchBudget extends ServiceMap.Service<
  OperationScratchBudget,
  OperationScratchBudgetService
>()("@agentxm/registry-client/scratch-budget/OperationScratchBudget") {}

export const makeOperationScratchBudget = (
  capacity: number,
): Effect.Effect<OperationScratchBudgetService> =>
  Effect.gen(function* () {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      return yield* Effect.die(new Error("Scratch capacity must be a positive finite integer"));
    }
    const used = yield* Ref.make(0);
    return {
      capacity,
      reserve: (maxBytes) =>
        Effect.gen(function* () {
          if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > capacity) {
            return yield* new OperationScratchLimitExceeded({
              capacity,
              requested: maxBytes,
            });
          }
          const held = yield* Ref.make({ bytes: maxBytes, settled: false });
          yield* Effect.acquireRelease(
            Ref.modify(used, (current) => {
              const next = current + maxBytes;
              return [next <= capacity, next <= capacity ? next : current] as const;
            }).pipe(
              Effect.flatMap((admitted) =>
                admitted
                  ? Effect.void
                  : Effect.fail(
                      new OperationScratchLimitExceeded({ capacity, requested: maxBytes }),
                    ),
              ),
            ),
            () =>
              Ref.get(held).pipe(
                Effect.flatMap((state) => Ref.update(used, (current) => current - state.bytes)),
              ),
          );
          return {
            settle: (actualBytes) =>
              Effect.uninterruptible(
                Effect.gen(function* () {
                  if (
                    !Number.isSafeInteger(actualBytes) ||
                    actualBytes < 0 ||
                    actualBytes > maxBytes
                  ) {
                    return yield* new OperationScratchLimitExceeded({
                      capacity: maxBytes,
                      requested: actualBytes,
                    });
                  }
                  const released = yield* Ref.modify(held, (state) =>
                    state.settled
                      ? ([0, state] as const)
                      : ([
                          state.bytes - actualBytes,
                          { bytes: actualBytes, settled: true },
                        ] as const),
                  );
                  yield* Ref.update(used, (current) => current - released);
                }),
              ),
          } satisfies OperationScratchReservation;
        }),
    } satisfies OperationScratchBudgetService;
  });
