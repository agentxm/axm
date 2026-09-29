/** Explicit ownership transfer of one observed instruction region. */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import {
  commentStyleForTarget,
  inspectManagedRegion,
} from "@agentxm/workspace-kernel/agent-adapters";
import {
  captureAgentOutputAuthority,
  HOOK_FALLBACKS_REGION_OWNER,
  KNOWLEDGE_REGION_OWNER,
  RULES_REGION_OWNER,
  reconcileNativeManagedRegion,
} from "@agentxm/workspace-kernel/projection";
import { SettingsReader, WorkspaceLocation } from "@agentxm/workspace-kernel/workspace-state";
import {
  prepareExecutionCandidate,
  resolveExecutionCandidate,
} from "@agentxm/workspace-kernel/planning";
import { type Plan, type PlanExecution } from "@agentxm/workspace-kernel/operations";
import { runWorkspaceTransaction } from "@agentxm/workspace-kernel/settlement";
import {
  WorkspaceConfigurationFailed,
  configurationFailureToStepFailure,
  workspaceChangeFailedToStepFailure,
} from "../errors.js";
import type { ManageInstructionsRequirements } from "./manage-instructions.js";

export type AdoptableInstructionRegion = "rules" | "knowledge" | "hook-fallbacks";

export const prepareAdoptInstructionRegion = Effect.fn("Instructions.prepareAdoption")(
  function* (request: { readonly region: AdoptableInstructionRegion; readonly fileName: string }) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const location = yield* WorkspaceLocation;
    const settings = yield* SettingsReader;
    const file = path.resolve(location.baseDir, request.fileName);
    const fail = (detail: string, cause?: unknown) =>
      new WorkspaceConfigurationFailed({
        category: "conflict",
        detail,
        ...(cause === undefined ? {} : { cause }),
      });
    const raw = yield* fs
      .readFileString(file)
      .pipe(
        Effect.mapError((cause) =>
          fail("Cannot read the instruction region selected for adoption", cause),
        ),
      );
    const style = commentStyleForTarget(request.fileName);
    if (Option.isNone(style))
      return yield* fail("Instruction region adoption requires a comment-bearing file");
    const state = inspectManagedRegion(raw, request.region, style.value);
    if (state.state !== "complete")
      return yield* fail("Instruction region adoption requires one complete, supported region");
    const authority = yield* captureAgentOutputAuthority();
    const owners =
      request.region === "rules"
        ? authority.expectedRegions.rule
        : request.region === "knowledge"
          ? authority.expectedRegions.knowledge
          : authority.expectedHooks;
    const owner =
      request.region === "rules"
        ? RULES_REGION_OWNER
        : request.region === "knowledge"
          ? KNOWLEDGE_REGION_OWNER
          : HOOK_FALLBACKS_REGION_OWNER;
    if (owners.length === 0)
      return yield* fail("The selected region has no accepted source authority in this scope");
    const args = {
      workspaceRoot: location.baseDir,
      ownerRoot: path.dirname(location.runtimeDir),
      nativeDirectoryInputs: location.nativeDirectoryInputs,
      scope: location.scope,
      targetPath: file,
      displayPath: request.fileName,
      owner,
      region: request.region,
      generation: state.startMarker.generation ?? "",
      rendered: state.body,
      contributors: owners,
      ownership: owners,
      configuredAgentIds: yield* settings.configuredAgents,
      eligible: false,
      adoption: { expectedRaw: raw },
    };
    const preview = yield* reconcileNativeManagedRegion({ ...args, dryRun: true }).pipe(
      Effect.mapError((cause) =>
        fail("The selected instruction region cannot be safely adopted", cause),
      ),
    );
    const artifact = {
      path: request.fileName,
      scope: location.scope,
      change: preview.changed ? ("updated" as const) : ("unchanged" as const),
      nativeLocations: [preview.nativeLocation],
    };
    const plan: Plan<ManageInstructionsRequirements> = {
      _tag: "Plan",
      name: "Adopt instruction region",
      description: Option.some(
        `Accept ${request.region} ownership in ${request.fileName}; preserve its body`,
      ),
      presentation: {
        verb: { imperative: "adopt", past: "Adopted", gerund: "Adopting" },
        subject: { singular: "instruction region", plural: "instruction regions" },
      },
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              label: `${request.region} in ${request.fileName}`,
              readiness: "ready",
              artifact,
              materialPaths: owners.map((source) => source.root),
              run: runWorkspaceTransaction({
                transition: Effect.gen(function* () {
                  const current = yield* captureAgentOutputAuthority().pipe(
                    Effect.mapError((cause) =>
                      fail(
                        "Cannot revalidate accepted source authority for instruction region adoption",
                        cause,
                      ),
                    ),
                  );
                  if (JSON.stringify(current) !== JSON.stringify(authority))
                    return yield* fail(
                      "Accepted source authority changed after instruction region adoption was planned",
                    );
                  return yield* reconcileNativeManagedRegion(args).pipe(
                    Effect.mapError((cause) =>
                      fail("Instruction region adoption could not complete", cause),
                    ),
                  );
                }).pipe(Effect.mapError(configurationFailureToStepFailure)),
                validate: () => Effect.void,
              }).pipe(
                Effect.mapError(workspaceChangeFailedToStepFailure),
                Effect.map((result) => ({
                  result: "success" as const,
                  message: result.changed
                    ? "Adopted instruction region ownership"
                    : "Instruction region ownership already matches",
                  artifact: { ...artifact, nativeLocations: [result.nativeLocation] },
                })),
              ),
            },
          ],
        },
      ],
    };
    return yield* prepareExecutionCandidate(plan);
  },
);

export const AdoptInstructionRegion = {
  prepare: prepareAdoptInstructionRegion,
  previewOrApply: (
    candidate: Effect.Success<ReturnType<typeof prepareAdoptInstructionRegion>>,
    execution: PlanExecution,
  ) => resolveExecutionCandidate(candidate, execution),
} as const;
