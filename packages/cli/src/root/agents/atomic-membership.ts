import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import type { JobStepResult, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import type { WorkspaceMutationsService } from "@agentxm/client-core/unstable/workspace";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";

interface AtomicMembershipStepsArgs<Requirements, Output> {
  readonly ws: WorkspaceMutationsService;
  readonly steps: ReadonlyArray<PlannedJobStep<Requirements, Output>>;
  readonly validate: (
    results: ReadonlyArray<JobStepResult<Output>>,
  ) => Effect.Effect<void, AppError, Requirements>;
}

interface AtomicAttempt<Output> {
  readonly results: ReadonlyArray<JobStepResult<Output>>;
  readonly failedIndex?: number;
}

const failedResult = <Output>(
  error: AppError,
  message: string = error.detail,
): JobStepResult<Output> => ({
  result: "error",
  message,
  error,
});

const blockedResult = <Output>(message: string): JobStepResult<Output> =>
  failedResult(
    makeAppError({
      code: "conflict",
      detail: message,
    }),
    message,
  );

const rollbackResults = <Requirements, Output>(
  executable: ReadonlyArray<
    Exclude<PlannedJobStep<Requirements, Output>, { readonly readiness: "error" }>
  >,
  attempt: AtomicAttempt<Output>,
  transactionError: AppError,
): ReadonlyArray<JobStepResult<Output>> => {
  const actualFailureIndex = attempt.failedIndex ?? Math.max(0, attempt.results.length - 1);
  const failedLabel = executable[actualFailureIndex]?.label ?? "atomic agent membership validation";

  return executable.map((_, index) => {
    if (index < actualFailureIndex) {
      return blockedResult(`blocked: rolled back after ${failedLabel} failed`);
    }
    if (index > actualFailureIndex) {
      return blockedResult(`blocked by ${failedLabel} failure`);
    }
    const attempted = attempt.results[index];
    return attempted?.result === "error"
      ? attempted
      : failedResult(transactionError, transactionError.detail);
  });
};

/**
 * Keep plan-level preview and per-step results while applying every membership
 * and artifact step through one workspace transaction.
 */
export const makeAtomicMembershipSteps = Effect.fn("Agents.makeAtomicMembershipSteps")(function* <
  Requirements,
  Output,
>(args: AtomicMembershipStepsArgs<Requirements, Output>) {
  if (args.steps.some((step) => step.readiness === "error")) return args.steps;

  const executable = args.steps.filter(
    (
      step,
    ): step is Exclude<PlannedJobStep<Requirements, Output>, { readonly readiness: "error" }> =>
      step.readiness !== "error",
  );
  const attemptRef = yield* Ref.make<AtomicAttempt<Output>>({ results: [] });
  const transition = args.ws
    .runTransaction({
      transition: Effect.gen(function* () {
        const results: Array<JobStepResult<Output>> = [];
        for (const [index, step] of executable.entries()) {
          const result = yield* step.run.pipe(
            Effect.catch((error) => Effect.succeed(failedResult<Output>(error))),
          );
          results.push(result);
          yield* Ref.set(attemptRef, {
            results: [...results],
            ...(result.result === "error" ? { failedIndex: index } : {}),
          });
          if (result.result === "error") {
            return yield* result.error;
          }
        }
        return results;
      }),
      validate: args.validate,
    })
    .pipe(
      Effect.catch((transactionError) =>
        Ref.get(attemptRef).pipe(
          Effect.map((attempt) => rollbackResults(executable, attempt, transactionError)),
        ),
      ),
    );
  const sharedTransition = yield* Effect.cached(transition);
  let resultIndex = 0;

  return args.steps.map((step): PlannedJobStep<Requirements, Output> => {
    if (step.readiness === "error") return step;
    const index = resultIndex;
    resultIndex += 1;
    return {
      ...step,
      run: sharedTransition.pipe(
        Effect.flatMap((results) => {
          const result = results[index];
          return result === undefined
            ? makeAppError({
                code: "internal",
                detail: `Atomic agent membership transition omitted step ${index + 1}`,
              })
            : Effect.succeed(result);
        }),
      ),
    };
  });
});
