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
import { AGENTS } from "../../agents/registry.js";
import type { AgentId } from "../../agents/types.js";
import { makeAppError } from "../../app-error/index.js";
import type { OperationHandler } from "../../plan/apply-plan.js";
import type { Operation } from "../../plan/plan.js";
import type { JobStepResult } from "../../plan/plan.js";
import { Workspace } from "../../workspace/service-interface.js";
import { removeFromAllCanonicalLocations } from "../../utils/index.js";
import { sanitizeName } from "../../extensions/utils.js";
import { existsInAnyCanonicalLocation } from "../disk-check.js";
import { getSkillFqn, isReferencedByExtensionPack } from "../utils.js";

// -----------------------------------------------------------------------------
const isKnownAgentId = (id: string): id is AgentId => Object.hasOwn(AGENTS, id);

// Operation types
// -----------------------------------------------------------------------------

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
 * Reads workspace paths from the Workspace service, then orchestrates:
 * 1. Sanitize skill name for filesystem
 * 2. Read lockfile to determine installed agents
 * 3. Remove agent symlinks concurrently (skip missing)
 * 4. Remove from all known canonical locations (full uninstall only)
 * 5. Remove or update lockfile entry
 */
export const uninstallSkill: OperationHandler<
  UninstallSkillOperation,
  FileSystem.FileSystem | Path.Path | Workspace
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;
    const base = ws.baseDir;

    const sanitizedName = sanitizeName(op.args.skillName);

    // Read lockfile entry for this skill via Workspace
    const lockEntryOption = yield* ws.getLockedSkill(op.args.skillName).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "UNINSTALL_SKILL_LOCKFILE_READ_FAILED",
          what: `Failed to read lockfile: ${e.what}`,
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
            (entry) =>
              fs.remove(entry.path, { recursive: true }).pipe(Effect.catch(() => Effect.void)),
            { concurrency: "unbounded" },
          );
        }

        // Fall back to agent descriptor-based path resolution
        if (!isKnownAgentId(agentId)) return Effect.void;
        const agent = AGENTS[agentId];

        const agentSkillPath = path.join(base, agent.skills.dir, sanitizedName);
        return fs.remove(agentSkillPath, { recursive: true }).pipe(Effect.catch(() => Effect.void));
      },
      { concurrency: "unbounded" },
    );

    // Handle partial vs full uninstall
    if (isPartialUninstall && lockEntry) {
      const remainingAgents = lockAgents.filter((a) => !agentFilter.includes(a));

      if (remainingAgents.length > 0) {
        // Update lockfile entry with remaining agents via Workspace.setSkill
        yield* ws
          .setSkill({
            name: op.args.skillName,
            lockEntry: { ...lockEntry, agents: remainingAgents },
            versionConstraint: Option.none(),
          })
          .pipe(
            Effect.mapError((e) =>
              makeAppError({
                code: "UNINSTALL_SKILL_LOCKFILE_WRITE_FAILED",
                what: `Failed to update lockfile: ${e.what}`,
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
    const lockedPacks = yield* ws
      .getLockedExtensionPacks()
      .pipe(Effect.catch(() => Effect.succeed({})));
    const fqn = getSkillFqn(op.args.skillName, lockEntry);
    const packOwned = fqn !== undefined && isReferencedByExtensionPack(fqn, lockedPacks);

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
