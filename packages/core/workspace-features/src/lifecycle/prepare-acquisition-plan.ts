/** Shared acquisition, trust, projection-readiness, and retained-package settlement. */
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type { WorkspaceTransactionScope } from "@agentxm/workspace-kernel/settlement";
import * as Option from "effect/Option";
import { sourceRefContentKey } from "@agentxm/workspace-kernel/acquisition";
import {
  installRefused,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/workspace-kernel/operations";
import {
  activeInstructionsConfig,
  instructionReadinessDetail,
  instructionReconciliationReadiness,
  observeInstructions,
} from "@agentxm/workspace-kernel/projection";
import {
  acceptedLockedCanonicalPath,
  acceptedLockedResolutionRef,
  usableAcceptedCanonical,
  WorkspaceLocation,
  AcceptedResolutionWriter,
} from "@agentxm/workspace-kernel/workspace-state";
import {
  groupRetainedPackageSteps,
  StepFailureConversion,
} from "@agentxm/workspace-kernel/reconciliation";
import { withPublisherTrust } from "./publisher-binding.js";
import { withSourceSwitches } from "./source-switch.js";

/** Install and update settle external acquisitions through the same planner path. */
export const prepareAcquisitionPlan = <R>(input: Plan<R>, reinstall: boolean) =>
  Effect.gen(function* () {
    // Every acceptance a plan proposes is classified against the accepted
    // resolution here, so the root, per-type, locator, and configured routes
    // share one publisher-trust rule instead of restating it five times.
    const plan = {
      ...input,
      jobs: yield* Effect.forEach(input.jobs, (job) =>
        Effect.gen(function* () {
          const steps = yield* Effect.forEach(job.steps, (step) =>
            Effect.gen(function* () {
              if (step.readiness === "error") return step;
              const refs =
                step.acquisitionRefs ??
                (step.sourceBinding === undefined
                  ? []
                  : [step.sourceBinding.ref, ...(step.sourceBinding.members ?? [])]);
              const boundRefs =
                step.sourceBinding === undefined
                  ? refs
                  : [step.sourceBinding.ref, ...(step.sourceBinding.members ?? [])];
              const canonicalPaths = yield* Effect.forEach(boundRefs, (ref) =>
                acceptedLockedCanonicalPath({
                  type: ref.type,
                  name: ref.type === "mcp-server" ? ref.server.name : ref.name,
                }).pipe(
                  Effect.map(Option.toArray),
                  Effect.mapError((cause) =>
                    installRefused({
                      category: "internal",
                      detail: `Accepted path for ${ref.name} could not be read`,
                      cause,
                    }),
                  ),
                ),
              );
              const acquisitionRefs = yield* Effect.filter(refs, (ref) =>
                Effect.gen(function* () {
                  if (ref.refType === "workspace") return false;
                  // Only immutable Registry selections may reuse accepted content.
                  // Path, Git, and HTTP sources must still acquire what they offer now.
                  if (reinstall || ref.refType !== "registry") return true;
                  const canonical = yield* usableAcceptedCanonical({
                    type: ref.type,
                    name: ref.type === "mcp-server" ? ref.server.name : ref.name,
                  }).pipe(
                    Effect.mapError((cause) =>
                      installRefused({
                        category: "internal",
                        detail: `Accepted content for ${ref.name} could not be inspected`,
                        cause,
                      }),
                    ),
                  );
                  if (Option.isNone(canonical)) return true;
                  const accepted = yield* acceptedLockedResolutionRef({
                    type: ref.type,
                    name: ref.type === "mcp-server" ? ref.server.name : ref.name,
                  }).pipe(
                    Effect.mapError((cause) =>
                      installRefused({
                        category: "internal",
                        detail: `Accepted resolution for ${ref.name} could not be read`,
                        cause,
                      }),
                    ),
                  );
                  return (
                    Option.isNone(accepted) ||
                    sourceRefContentKey(accepted.value) !== sourceRefContentKey(ref)
                  );
                }),
              );
              return {
                ...step,
                acquisitionRefs,
                materialPaths: [...(step.materialPaths ?? []), ...canonicalPaths.flat()],
              };
            }),
          );
          return { ...job, steps };
        }),
      ),
    };
    const trusted = yield* withPublisherTrust(plan);
    const sourceAware = yield* withSourceSwitches(trusted);
    const touchesInstructionSurface = (step: PlannedJobStep<R>) => {
      const key = step.key ?? "";
      return [
        "rule:",
        "knowledge:",
        "pack:",
        "projection:aggregate-units",
        "projection:rule",
        "projection:knowledge",
      ].some((prefix) => key.startsWith(prefix));
    };
    const hasSharedWriter = sourceAware.jobs.some((job) =>
      job.steps.some(touchesInstructionSurface),
    );
    const config = hasSharedWriter ? yield* activeInstructionsConfig() : Option.none();
    const readiness = Option.isSome(config)
      ? yield* Effect.gen(function* () {
          const snapshot = yield* observeInstructions({ config: config.value });
          const location = yield* WorkspaceLocation;
          return yield* instructionReconciliationReadiness({
            snapshot,
            workspaceRoot: location.baseDir,
          });
        })
      : Option.none();
    const gated = Option.isSome(readiness)
      ? {
          ...sourceAware,
          jobs: sourceAware.jobs.map((job) => ({
            ...job,
            steps: job.steps.map((step) =>
              touchesInstructionSurface(step)
                ? {
                    ...(step.key === undefined ? {} : { key: step.key }),
                    label: step.label,
                    readiness: "error" as const,
                    errorMessage: instructionReadinessDetail(readiness.value),
                    ...(step.artifact === undefined ? {} : { artifact: step.artifact }),
                  }
                : step,
            ),
          })),
        }
      : sourceAware;
    const acceptedWriter = yield* AcceptedResolutionWriter;
    const conversion = yield* StepFailureConversion;
    const location = yield* WorkspaceLocation;
    const grouped: Plan<R | FileSystem.FileSystem | Path.Path | WorkspaceTransactionScope> = {
      ...gated,
      jobs: yield* Effect.forEach(gated.jobs, (job) =>
        groupRetainedPackageSteps({
          steps: job.steps,
          artifact: { path: location.baseDir, scope: location.scope, change: "created" },
          message: "Installed retained package components",
          acceptedResolutions: acceptedWriter.withBatch,
          toStepFailure: conversion.toStepFailure,
        }).pipe(Effect.map((steps) => ({ ...job, steps }))),
      ),
    };
    return grouped;
  });
