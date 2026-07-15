/**
 * Uninstall skill executor — orchestrates per-skill removal pipeline.
 *
 * Pipeline: sanitize name -> read lockfile -> remove agent symlinks (concurrent) ->
 * remove canonical dir -> remove lockfile entry.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Layer from "effect/Layer";
import { DefaultCodingAgentRepository } from "../../agents/index.js";
import { AGENTS } from "../../agents/registry.js";
import type { AgentId } from "../../agents/types.js";
import { makeAppError } from "../../app-error/index.js";
import type { OperationHandler } from "../../plan/apply-plan.js";
import type { Operation } from "../../plan/plan.js";
import type { JobStepResult } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { removeFromAllCanonicalLocations } from "../../utils/index.js";
import { sanitizeName } from "../../extensions/utils.js";
import { existsInAnyCanonicalLocation } from "../disk-check.js";
import { getSkillFqn, isReferencedByPack } from "../utils.js";

// Operation types
// -----------------------------------------------------------------------------

const isKnownAgentId = (id: string): id is AgentId => Object.hasOwn(AGENTS, id);

/**
 * Args for the uninstall-skill operation.
 */
export interface UninstallSkillOperationArgs {
  readonly skillName: string;
  /** Agent filter for partial uninstall. Empty = all agents. */
  readonly agents: ReadonlyArray<string>;
}

/**
 * Remove a skill from the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type UninstallSkillOperation = Operation<"uninstall-skill", UninstallSkillOperationArgs>;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Uninstall-skill operation handler.
 *
 * Reads workspace paths from the WorkspaceMutations service, then orchestrates:
 * 1. Sanitize skill name for filesystem
 * 2. Read lockfile to determine installed agents
 * 3. Remove agent symlinks concurrently (skip missing)
 * 4. Remove from all known canonical locations (full uninstall only)
 * 5. Remove or update lockfile entry
 */
export const uninstallSkill: OperationHandler<
  UninstallSkillOperation,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    const base = ws.baseDir;
    const fsPathLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
    );

    const sanitizedName = sanitizeName(op.args.skillName);

    // Read lockfile entry for this skill via WorkspaceMutations
    const lockEntryOption = yield* ws.getLockedSkill(op.args.skillName).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "internal",
          detail: `Failed to read lockfile: ${e.message}`,
          cause: e,
        }),
      ),
    );
    const lockEntry = Option.getOrUndefined(lockEntryOption);

    // Determine if skill is installed anywhere (check all known locations)
    const installedOnDisk = yield* existsInAnyCanonicalLocation(fs, path, base, op.args.skillName);

    if (!lockEntry && !installedOnDisk) {
      return { result: "success", message: "not installed" } satisfies JobStepResult;
    }

    // Determine which agents to remove from
    const lockAgents = lockEntry?.agents ?? [];
    const agentFilter = op.args.agents;
    const isPartialUninstall = agentFilter.length > 0;
    const agentsToRemove = isPartialUninstall ? agentFilter : lockAgents;
    const remainingAgents = isPartialUninstall
      ? lockAgents.filter((agent) => !agentFilter.includes(agent))
      : [];
    const materializationAgents =
      yield* DefaultCodingAgentRepository.getMaterializationAgents().pipe(
        Effect.provideService(WorkspaceMutations, ws),
      );
    const agentsById: ReadonlyMap<string, (typeof materializationAgents)[number]> = new Map(
      materializationAgents.map((agent) => [agent.id, agent]),
    );

    const resolveAgentArtifactPath = (agentId: string) => {
      const configuredAgent = agentsById.get(agentId);
      const agentEffect =
        configuredAgent !== undefined
          ? Effect.succeed(Option.some(configuredAgent))
          : isKnownAgentId(agentId)
            ? DefaultCodingAgentRepository.get(agentId).pipe(Effect.map(Option.some))
            : Effect.succeed(Option.none());

      return agentEffect.pipe(
        Effect.flatMap((agentOption) => {
          if (Option.isNone(agentOption)) return Effect.succeed(Option.none<string>());
          return agentOption.value
            .resolveEffectiveSkillsDir({ workspaceRoot: base })
            .pipe(
              Effect.map((outcome) =>
                outcome._tag === "supported"
                  ? Option.some(path.normalize(path.join(outcome.dir, sanitizedName)))
                  : Option.none<string>(),
              ),
            );
        }),
        Effect.provide(fsPathLayer),
      );
    };

    const retainedArtifactOptions = yield* Effect.forEach(
      remainingAgents,
      resolveAgentArtifactPath,
      { concurrency: "unbounded" },
    );
    const retainedArtifactPaths = new Set(
      retainedArtifactOptions.flatMap((artifactPath) =>
        Option.isSome(artifactPath) ? [artifactPath.value] : [],
      ),
    );

    // Remove agent symlinks/copies concurrently.
    // When renderedFiles are tracked (copy-mode), prefer tracked paths;
    // otherwise fall back to agent descriptor-based path resolution.
    const renderedFiles = lockEntry?.renderedFiles;
    yield* Effect.forEach(
      agentsToRemove,
      (agentId) => {
        // Check renderedFiles for tracked copy-mode paths
        const tracked = renderedFiles?.[agentId];
        if (tracked !== undefined && tracked.length > 0) {
          return Effect.forEach(
            tracked,
            (entry) => {
              const artifactPath = path.normalize(path.resolve(base, entry.path));
              return retainedArtifactPaths.has(artifactPath)
                ? Effect.void
                : fs
                    .remove(artifactPath, { recursive: true })
                    .pipe(Effect.catch(() => Effect.void));
            },
            { concurrency: "unbounded" },
          );
        }

        const configuredAgent = agentsById.get(agentId);
        const agentEffect =
          configuredAgent !== undefined
            ? Effect.succeed(Option.some(configuredAgent))
            : isKnownAgentId(agentId)
              ? DefaultCodingAgentRepository.get(agentId).pipe(Effect.map(Option.some))
              : Effect.succeed(Option.none());

        return agentEffect.pipe(
          Effect.flatMap((agentOption) => {
            if (Option.isNone(agentOption)) {
              return Effect.succeed({
                _tag: "unsupported",
                reason: `Unknown coding agent: ${agentId}`,
              } as const);
            }
            return agentOption.value.resolveEffectiveSkillsDir({ workspaceRoot: base });
          }),
          Effect.provide(fsPathLayer),
          Effect.flatMap((outcome) =>
            outcome._tag === "supported"
              ? (() => {
                  const artifactPath = path.normalize(path.join(outcome.dir, sanitizedName));
                  return retainedArtifactPaths.has(artifactPath)
                    ? Effect.void
                    : fs
                        .remove(artifactPath, { recursive: true })
                        .pipe(Effect.catch(() => Effect.void));
                })()
              : Effect.void,
          ),
        );
      },
      { concurrency: "unbounded" },
    );

    // Handle partial vs full uninstall
    if (isPartialUninstall && lockEntry) {
      if (remainingAgents.length > 0) {
        // Update lockfile entry with remaining agents via WorkspaceMutations.setSkill
        yield* ws
          .setSkill({
            name: op.args.skillName,
            lockEntry: { ...lockEntry, agents: remainingAgents },
            versionRange: Option.none(),
          })
          .pipe(
            Effect.mapError((e) =>
              makeAppError({
                code: "internal",
                detail: `Failed to update lockfile: ${e.message}`,
                cause: e,
              }),
            ),
          );

        const agentList = [...agentsToRemove].join(", ");
        return {
          result: "success",
          message: `Uninstalled ${op.args.skillName} from ${agentList}`,
        } satisfies JobStepResult;
      }
      // Fall through to full uninstall if no agents remain
    }

    // Check if a pack still references this skill
    const lockedPacks = yield* ws.getLockedPacks().pipe(Effect.catch(() => Effect.succeed({})));
    const fqn = getSkillFqn(op.args.skillName, lockEntry);
    const packOwned = fqn !== undefined && isReferencedByPack(fqn, lockedPacks);

    if (packOwned) {
      // Pack still references this skill — remove from settings only, keep lockfile + disk
      yield* ws.removeSkillFromSettings(op.args.skillName).pipe(Effect.catch(() => Effect.void));

      return {
        result: "success",
        message: `Uninstalled ${op.args.skillName}`,
      } satisfies JobStepResult;
    }

    // Full uninstall: remove from all known canonical locations
    if (installedOnDisk) {
      yield* removeFromAllCanonicalLocations(fs, base, "skills", sanitizedName, path);
    }

    // Remove from both settings and lockfile (swallow errors on full uninstall)
    yield* ws.removeSkill(op.args.skillName).pipe(Effect.catch(() => Effect.void));

    return {
      result: "success",
      message: `Uninstalled ${op.args.skillName}`,
    } satisfies JobStepResult;
  });
