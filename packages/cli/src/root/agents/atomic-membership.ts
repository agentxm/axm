import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import type { JobStepResult, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import type { WorkspaceMutationsService } from "@agentxm/client-core/unstable/workspace";
import * as Effect from "effect/Effect";

interface AtomicMembershipStepsArgs {
  readonly ws: WorkspaceMutationsService;
  readonly steps: ReadonlyArray<PlannedJobStep>;
  readonly validate: (results: ReadonlyArray<JobStepResult>) => Effect.Effect<void, AppError>;
}

const executeStep = (step: Exclude<PlannedJobStep, { readonly readiness: "error" }>) =>
  step.run.pipe(
    Effect.flatMap((result) =>
      result.result === "error" ? Effect.fail(result.error) : Effect.succeed(result),
    ),
  );

/**
 * Keep plan-level preview and per-step results while applying every membership
 * and artifact step through one workspace transaction.
 */
export const makeAtomicMembershipSteps = Effect.fn("Agents.makeAtomicMembershipSteps")(function* (
  args: AtomicMembershipStepsArgs,
) {
  if (args.steps.some((step) => step.readiness === "error")) return args.steps;

  const executable = args.steps.filter(
    (step): step is Exclude<PlannedJobStep, { readonly readiness: "error" }> =>
      step.readiness !== "error",
  );
  const transition = args.ws.runTransaction({
    transition: Effect.forEach(executable, executeStep, { concurrency: 1 }),
    validate: args.validate,
  });
  const sharedTransition = yield* Effect.cached(transition);
  let resultIndex = 0;

  return args.steps.map((step): PlannedJobStep => {
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
