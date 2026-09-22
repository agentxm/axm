import * as ServiceMap from "effect/Context";
import * as Data from "effect/Data";
import * as Deferred from "effect/Deferred";
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

interface ScratchState {
  readonly bytes: number;
  readonly unsettled: number;
  readonly changed: Deferred.Deferred<void>;
}

type Admission =
  | { readonly _tag: "admitted" }
  | { readonly _tag: "wait"; readonly changed: Deferred.Deferred<void> }
  | { readonly _tag: "exhausted" };

interface HeldState {
  readonly bytes: number;
  readonly settled: boolean;
}

export const makeOperationScratchBudget = (
  capacity: number,
): Effect.Effect<OperationScratchBudgetService> =>
  Effect.gen(function* () {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      return yield* Effect.die(new Error("Scratch capacity must be a positive finite integer"));
    }
    const used = yield* Ref.make({
      bytes: 0,
      unsettled: 0,
      changed: yield* Deferred.make<void>(),
    });
    const releaseCapacity = (bytes: number, unsettled: number) =>
      Effect.gen(function* () {
        const nextSignal = yield* Deferred.make<void>();
        const previousSignal = yield* Ref.modify(used, (current) => [
          current.changed,
          {
            bytes: current.bytes - bytes,
            unsettled: current.unsettled - unsettled,
            changed: nextSignal,
          },
        ]);
        yield* Deferred.succeed(previousSignal, undefined);
      });
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
          const held = yield* Ref.make<HeldState>({ bytes: maxBytes, settled: false });
          while (true) {
            const decision = yield* Effect.uninterruptible(
              Ref.modify(used, (current): readonly [Admission, ScratchState] => {
                if (current.bytes + maxBytes <= capacity) {
                  return [
                    { _tag: "admitted" },
                    {
                      ...current,
                      bytes: current.bytes + maxBytes,
                      unsettled: current.unsettled + 1,
                    },
                  ];
                }
                return current.unsettled > 0
                  ? [{ _tag: "wait", changed: current.changed }, current]
                  : [{ _tag: "exhausted" }, current];
              }).pipe(
                Effect.tap((outcome) =>
                  outcome._tag === "admitted"
                    ? Effect.addFinalizer(() =>
                        Ref.get(held).pipe(
                          Effect.flatMap((state) =>
                            releaseCapacity(state.bytes, state.settled ? 0 : 1),
                          ),
                        ),
                      )
                    : Effect.void,
                ),
              ),
            );
            if (decision._tag === "admitted") break;
            if (decision._tag === "exhausted") {
              return yield* new OperationScratchLimitExceeded({
                capacity,
                requested: maxBytes,
              });
            }
            yield* Deferred.await(decision.changed);
          }
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
                  const result = yield* Ref.modify(
                    held,
                    (
                      state,
                    ): readonly [
                      { readonly first: boolean; readonly released: number },
                      HeldState,
                    ] =>
                      state.settled
                        ? [{ first: false, released: 0 }, state]
                        : [
                            { first: true, released: state.bytes - actualBytes },
                            { bytes: actualBytes, settled: true },
                          ],
                  );
                  if (result.first) yield* releaseCapacity(result.released, 1);
                }),
              ),
          } satisfies OperationScratchReservation;
        }),
    } satisfies OperationScratchBudgetService;
  });
