import * as Effect from "effect/Effect";
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

export const makeOperationExtractionBudget = (
  capacity: number,
): Effect.Effect<OperationExtractionBudgetService> =>
  Effect.gen(function* () {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      return yield* Effect.die(new Error("Extraction capacity must be a positive finite integer"));
    }
    const semaphore = yield* Semaphore.make(capacity);
    return {
      withExtraction: (effect) => semaphore.withPermit(effect),
    } satisfies OperationExtractionBudgetService;
  });
