import * as Effect from "effect/Effect";
import { sourceRefContentKey } from "../../acquisition/index.js";
import { StepFailure, type Plan, type PlannedJobStep } from "../../operations/index.js";
import { PlanSources } from "./plan-sources.js";

export const registryExposureRefsForStep = (step: PlannedJobStep<unknown, unknown>) =>
  (step.readiness === "error"
    ? []
    : [
        ...(step.exposureRefs ?? []),
        ...(step.acquisitionRefs ??
          (step.sourceBinding === undefined
            ? []
            : [step.sourceBinding.ref, ...(step.sourceBinding.members ?? [])])),
      ]
  ).filter((ref) => ref.refType === "registry");

/** Admission belongs to one callback stage, never the lockfile or local content cache. */
export const withRegistryExposure = <A, E, R>(
  plan: Plan<unknown, unknown>,
  phase: "before-acquisition" | "after-confirmation",
  use: (failures: ReadonlyMap<string, StepFailure>) => Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const refs = plan.jobs.flatMap((job) => job.steps.flatMap(registryExposureRefsForStep));
    yield* Effect.annotateCurrentSpan({
      "axm.eligibility.phase": phase,
      "axm.work.requested": refs.length,
      "axm.work.executed": 0,
      "axm.work.reused-count": 0,
      "axm.registry.denied": 0,
    });
    if (refs.length === 0) return yield* use(new Map<string, StepFailure>());
    const sources = yield* PlanSources;
    const unique = new Map(refs.map((ref) => [sourceRefContentKey(ref), ref]));
    return yield* sources.withAccess([...unique.values()], (failures) =>
      Effect.gen(function* () {
        yield* Effect.annotateCurrentSpan({
          "axm.work.executed": unique.size,
          "axm.work.reused-count": refs.length - unique.size,
          "axm.registry.denied": failures.size,
        });
        return yield* use(failures);
      }),
    );
  }).pipe(Effect.withSpan("axm.registry.eligibility"));

export const validateRegistryExposure = (
  plan: Plan<unknown, unknown>,
  phase: "after-confirmation",
) => withRegistryExposure(plan, phase, Effect.succeed);
