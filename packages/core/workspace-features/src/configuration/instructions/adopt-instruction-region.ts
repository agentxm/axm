/**
 * Explicit adoption of one observed instruction region: record it as current
 * in the lockfile without replacing its body.
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import {
  fenceSyntaxForTarget,
  inspectManagedRegion,
} from "@agentxm/workspace-kernel/agent-adapters";
import { KnowledgeManager, RuleManager } from "@agentxm/workspace-kernel/materialization";
import {
  captureAgentOutputAuthority,
  projectionUnitPath,
  reconcileNativeManagedRegion,
  resolveInstructionsConfig,
} from "@agentxm/workspace-kernel/projection";
import {
  AcceptedResolutionWriter,
  SettingsReader,
  WorkspaceLocation,
} from "@agentxm/workspace-kernel/workspace-state";
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

export type AdoptableInstructionRegion = "rules" | "knowledge";

export const prepareAdoptInstructionRegion = Effect.fn("Instructions.prepareAdoption")(
  function* (request: { readonly region: AdoptableInstructionRegion }) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const location = yield* WorkspaceLocation;
    const settings = yield* SettingsReader;
    const accepted = yield* AcceptedResolutionWriter;
    const fail = (detail: string, cause?: unknown) =>
      new WorkspaceConfigurationFailed({
        category: "conflict",
        detail,
        ...(cause === undefined ? {} : { cause }),
      });
    // The planned instruction target is the only file a region may live in.
    const config = yield* settings.instructionsConfig;
    const fileName = resolveInstructionsConfig(
      Option.isSome(config) && config.value !== false ? config.value : undefined,
    ).fileName;
    const file = path.resolve(location.baseDir, fileName);
    const displayPath = yield* projectionUnitPath(
      path.relative(location.baseDir, file).split(path.sep).join("/"),
    ).pipe(
      Effect.mapError((cause) =>
        fail("The planned instruction target is not inside the workspace", cause),
      ),
    );
    const raw = yield* fs
      .readFileString(file)
      .pipe(
        Effect.mapError((cause) =>
          fail("Cannot read the instruction region selected for adoption", cause),
        ),
      );
    const syntax = fenceSyntaxForTarget(displayPath);
    if (Option.isNone(syntax))
      return yield* fail("Instruction region adoption requires a Markdown instruction file");
    const state = inspectManagedRegion(raw, request.region, syntax.value);
    if (state.state !== "complete")
      return yield* fail("Instruction region adoption requires one complete, well-formed region");
    // Reading the rows decodes the lockfile, so a newer lockfile refuses here.
    yield* accepted.projectionRows(request.region);
    const authority = yield* captureAgentOutputAuthority();
    const owners =
      request.region === "rules"
        ? authority.expectedRegions.rule
        : authority.expectedRegions.knowledge;
    if (owners.length === 0)
      return yield* fail("The selected region has no accepted source authority in this scope");
    const gen = yield* (
      request.region === "rules"
        ? (yield* RuleManager).regionGeneration
        : (yield* KnowledgeManager).regionGeneration
    ).pipe(
      Effect.mapError((cause) =>
        fail("Cannot compute the current generation of the selected region", cause),
      ),
    );
    const args = {
      workspaceRoot: location.baseDir,
      ownerRoot: path.dirname(location.runtimeDir),
      nativeDirectoryInputs: location.nativeDirectoryInputs,
      scope: location.scope,
      targetPath: file,
      displayPath,
      region: request.region,
      body: state.body,
      gen,
      recorded: Option.none(),
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
      path: displayPath,
      scope: location.scope,
      change: "updated" as const,
      targets: [{ path: location.lockPath, change: "updated" as const }],
      nativeLocations: [preview.nativeLocation],
    };
    const plan: Plan<ManageInstructionsRequirements> = {
      _tag: "Plan",
      name: "Adopt instruction region",
      description: Option.some(
        `Record the ${request.region} region in ${displayPath} as current; preserve its body`,
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
              label: `${request.region} in ${displayPath}`,
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
                  return yield* accepted
                    .withBatch(
                      Effect.gen(function* () {
                        const result = yield* reconcileNativeManagedRegion(args);
                        yield* accepted.stageProjections(Option.toArray(result.rowChange));
                        return result;
                      }),
                    )
                    .pipe(
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
                  message: "Recorded the instruction region as current",
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
