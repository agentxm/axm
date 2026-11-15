/** Shared acquisition, trust, projection-readiness, and retained-package settlement. */
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type { WorkspaceTransactionScope } from "@agentxm/workspace-kernel/settlement";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
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
  DesiredStateReader,
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

/** Authorities whose accepted ref is reconstructed from the accepted row alone. */
const restoresAcceptedRow = (identity: { readonly authority: string }) =>
  identity.authority === "registry" ||
  identity.authority === "git" ||
  identity.authority === "http" ||
  identity.authority === "path";

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
                  const target = {
                    type: ref.type,
                    name: ref.type === "mcp-server" ? ref.server.name : ref.name,
                  };
                  const inspectionRefused = (cause: unknown) =>
                    installRefused({
                      category: "internal",
                      detail: `Accepted content for ${ref.name} could not be inspected`,
                      cause,
                    });
                  const offersOtherContent = (accepted: Option.Option<ExtensionRef>) =>
                    Option.isNone(accepted) ||
                    sourceRefContentKey(accepted.value) !== sourceRefContentKey(ref);
                  const observeUsable = usableAcceptedCanonical(target).pipe(
                    Effect.mapError(inspectionRefused),
                  );
                  // A sourced Registry, Git, HTTP, or path node restores exactly
                  // the ref its accepted row records. When that ref already
                  // offers other content, the proposal acquires whatever the
                  // accepted copy holds, so the copy is observed only for the
                  // accepted content itself.
                  const desired = (yield* (yield* DesiredStateReader)
                    .graph()
                    .pipe(Effect.mapError(inspectionRefused))).nodes.find(
                    (node) => node.type === target.type && node.name === target.name,
                  );
                  if (desired?.source !== undefined && restoresAcceptedRow(desired.identity)) {
                    const recorded = yield* Effect.result(acceptedLockedResolutionRef(target));
                    if (Result.isSuccess(recorded)) {
                      if (offersOtherContent(recorded.success)) return true;
                      return Option.isNone(yield* observeUsable);
                    }
                  }
                  const canonical = yield* observeUsable;
                  if (Option.isNone(canonical)) return true;
                  const accepted = yield* acceptedLockedResolutionRef(target).pipe(
                    Effect.mapError((cause) =>
                      installRefused({
                        category: "internal",
                        detail: `Accepted resolution for ${ref.name} could not be read`,
                        cause,
                      }),
                    ),
                  );
                  return offersOtherContent(accepted);
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
