import * as Effect from "effect/Effect";
import * as Cause from "effect/Cause";
import * as Exit from "effect/Exit";
import * as Semaphore from "effect/Semaphore";
import * as ServiceMap from "effect/Context";
import { captureWork } from "@agentxm/host-primitives/work-observation";

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
          const capture = yield* captureWork;
          const admission = capture?.begin("axm.admission.extraction", {
            attributes: { "axm.admission.capacity": capacity, "axm.admission.unit": "permits" },
          });
          const end = (exit: Exit.Exit<unknown, unknown>) =>
            Effect.sync(() =>
              admission?.finish(
                Exit.isSuccess(exit)
                  ? "success"
                  : Cause.hasInterruptsOnly(exit.cause)
                    ? "interrupted"
                    : "failure",
              ),
            );
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
