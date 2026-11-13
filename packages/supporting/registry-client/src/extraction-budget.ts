import * as Effect from "effect/Effect";
import * as Clock from "effect/Clock";
import * as Exit from "effect/Exit";
import * as Semaphore from "effect/Semaphore";
import * as ServiceMap from "effect/Context";

export interface OperationExtractionBudgetService {
  readonly withExtraction: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
}

/** Shared by archive extractions in one CLI operation. */
export class OperationExtractionBudget extends ServiceMap.Service<
  OperationExtractionBudget,
  OperationExtractionBudgetService
>()("@agentxm/registry-client/extraction-budget/OperationExtractionBudget") {}

export const makeOperationExtractionBudget = Effect.fnUntraced(function* (
  capacity: number,
): Effect.fn.Return<OperationExtractionBudgetService> {
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    return yield* Effect.die(new Error("Extraction capacity must be a positive finite integer"));
  }
  const semaphore = yield* Semaphore.make(capacity);
  return {
    withExtraction: (effect) =>
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const span = yield* Effect.makeSpan("axm.wait.extraction", {
            attributes: { "axm.wait.capacity": capacity },
          });
          const end = (exit: Exit.Exit<unknown, unknown>) =>
            Effect.gen(function* () {
              if (span.status._tag === "Ended") return;
              span.end(yield* Clock.currentTimeNanos, exit);
            });
          const admitted = semaphore.withPermits(1)(
            end(Exit.void).pipe(
              Effect.andThen(effect.pipe(Effect.withSpan("axm.archive.extraction"))),
            ),
          );
          return yield* Effect.onExit(restore(admitted), end);
        }),
      ),
  } satisfies OperationExtractionBudgetService;
});
