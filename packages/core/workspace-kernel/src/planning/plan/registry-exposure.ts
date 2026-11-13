import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
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
  const failures = new Map<string, StepFailure>();
  if (refs.length === 0) return failures;
  const sources = yield* PlanSources;
  const seen = new Set<string>();
  for (const ref of refs) {
    const key = sourceRefContentKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    const checked = yield* Effect.result(sources.validateExposure(ref));
    if (Result.isFailure(checked)) failures.set(key, checked.failure);
  }
  yield* Effect.annotateCurrentSpan({
    "axm.work.executed": seen.size,
    "axm.work.reused-count": refs.length - seen.size,
    "axm.registry.denied": failures.size,
  });
  return failures;
});
