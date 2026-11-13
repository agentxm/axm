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

/** Eligibility belongs to this preflight, never the lockfile or local content cache. */
export const validateRegistryExposure = Effect.fn("axm.registry.eligibility")(function* (
  plan: Plan<unknown, unknown>,
  phase: "before-acquisition" | "after-confirmation",
) {
  const refs = plan.jobs.flatMap((job) => job.steps.flatMap(registryExposureRefsForStep));
  yield* Effect.annotateCurrentSpan({
    "axm.eligibility.phase": phase,
    "axm.work.requested": refs.length,
    "axm.work.executed": 0,
    "axm.work.reused-count": 0,
    "axm.registry.denied": 0,
  });
  if (refs.length === 0) return new Map<string, StepFailure>();
  const sources = yield* PlanSources;
  const unique = new Map(refs.map((ref) => [sourceRefContentKey(ref), ref]));
  const failures = yield* sources.validateExposure([...unique.values()]);
  yield* Effect.annotateCurrentSpan({
    "axm.work.executed": unique.size,
    "axm.work.reused-count": refs.length - unique.size,
    "axm.registry.denied": failures.size,
  });
  return failures;
});
