import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { RegistryClientFactory } from "@agentxm/registry-client";
import { sourceRefContentKey } from "../../acquisition/index.js";
import { StepFailure, type Plan, type PlannedJobStep } from "../../operations/index.js";
import { resolutionFailureToStepFailure } from "../resolution-step-failure.js";

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
export const validateRegistryExposure = Effect.fn("validateRegistryExposure")(function* (
  plan: Plan<unknown, unknown>,
) {
  const refs = plan.jobs.flatMap((job) => job.steps.flatMap(registryExposureRefsForStep));
  const failures = new Map<string, StepFailure>();
  if (refs.length === 0) return failures;
  const factory = yield* Effect.serviceOption(RegistryClientFactory);
  const seen = new Set<string>();
  for (const ref of refs) {
    const key = sourceRefContentKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    const checked = yield* Effect.result(
      Effect.gen(function* () {
        if (Option.isNone(factory))
          return yield* new StepFailure({
            category: "internal",
            detail: "Registry access cannot be established before exposing external content.",
          });
        if (Option.isNone(ref.integrity))
          return yield* new StepFailure({
            category: "conflict",
            detail: "Registry exposure requires an exact accepted archive integrity.",
          });
        const client = yield* factory.value.forEndpoint(ref.source.location).pipe(
          Effect.mapError(
            (cause) =>
              new StepFailure({
                category: "internal",
                detail: "Registry access configuration is unavailable.",
                cause,
              }),
          ),
        );
        yield* client
          .validateExtensionAccess({
            owner: ref.owner,
            type: ref.type,
            name: ref.name,
            exact: {
              version: ref.version,
              integrity: ref.integrity.value,
              publisherBindingId: ref.publisherBindingId,
            },
          })
          .pipe(Effect.mapError(resolutionFailureToStepFailure));
      }),
    );
    if (Result.isFailure(checked)) failures.set(key, checked.failure);
  }
  return failures;
});
