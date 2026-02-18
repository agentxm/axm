/**
 * Uninstall skill executor — orchestrates per-skill removal pipeline.
 *
 * Pipeline: sanitize name -> read lockfile -> remove agent symlinks (concurrent) ->
 * remove canonical dir -> remove lockfile entry.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { getAgentById } from "../../../agents/registry.js";
import { makeCliError } from "../../../cli-error/index.js";
import type { OperationHandler } from "../../../workspace/apply-plan.js";
import type { OperationResult } from "../../../workspace/plan.js";
import { Workspace } from "../../../workspace/service.js";
import type { UninstallSkillOperation } from "../operations.js";
import { EXTERNAL_EXTENSIONS_DIR, REGISTRY_EXTENSIONS_DIR } from "../../../extensions/constants.js";
import { removeFromAllCanonicalLocations } from "../fs-helpers.js";
import { sanitizeName } from "../install/skill-utils.js";

/**
 * Check if a skill exists in any known canonical location.
 */
const existsInAnyLocation = (
  fsService: FileSystem.FileSystem,
  base: string,
  sanitizedName: string,
  pathService: Path.Path,
) =>
  Effect.gen(function* () {
    // Check non-registry canonical location
    const canonicalExists = yield* fsService
      .exists(pathService.join(base, EXTERNAL_EXTENSIONS_DIR, "skills", sanitizedName))
      .pipe(Effect.catchAll(() => Effect.succeed(false)));
    if (canonicalExists) return true;

    // Check registry canonical locations
    const extensionsDir = pathService.join(base, REGISTRY_EXTENSIONS_DIR);
    const extensionsDirExists = yield* fsService
      .exists(extensionsDir)
      .pipe(Effect.catchAll(() => Effect.succeed(false)));

    if (!extensionsDirExists) return false;

    const scopeDirs = yield* fsService
      .readDirectory(extensionsDir)
      .pipe(Effect.catchAll(() => Effect.succeed<ReadonlyArray<string>>([])));

    const results = yield* Effect.forEach(
      scopeDirs,
      (scopeDir) => {
        if (!scopeDir.startsWith("@")) return Effect.succeed(false);
        const skillPath = pathService.join(extensionsDir, scopeDir, "skills", sanitizedName);
        return fsService.exists(skillPath).pipe(Effect.catchAll(() => Effect.succeed(false)));
      },
      { concurrency: "unbounded" },
    );

    return results.some((exists) => exists);
  });

/**
 * Derive the FQN (`@scope/name`) for a skill lock entry, if it's a registry entry.
 */
const getSkillFqn = (
  skillName: string,
  lockEntry: { type: string; scope?: string; name?: string } | undefined,
): string | undefined => {
  if (lockEntry?.type === "registry" && lockEntry.scope && lockEntry.name) {
    return `${lockEntry.scope}/${lockEntry.name}`;
  }
  // For non-registry entries, the skill name itself may be a FQN (e.g., "@scope/name")
  return skillName.startsWith("@") ? skillName : undefined;
};

/**
 * Check if a skill is referenced by any pack's `resolvedSkills`.
 *
 * Pure function — scans all pack lock entries for the given FQN.
 */
const isReferencedByPack = (
  skillFqn: string,
  lockedPacks: Readonly<Record<string, { resolvedSkills: Readonly<Record<string, string>> }>>,
): boolean => Object.values(lockedPacks).some((pack) => skillFqn in pack.resolvedSkills);

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
        makeCliError({
          code: "UNINSTALL_SKILL_LOCKFILE_READ_FAILED",
          what: `Failed to read lockfile: ${e.what}`,
          cause: e,
        }),
      ),
    );
    const lockEntry = Option.getOrUndefined(lockEntryOption);

    // Determine if skill is installed anywhere (check all known locations)
    const installedOnDisk = yield* existsInAnyLocation(fs, base, sanitizedName, path);

    if (!lockEntry && !installedOnDisk) {
      return { result: "no-op", message: "not installed" } satisfies OperationResult;
    }

    // Determine which agents to remove from
    const lockAgents: readonly string[] = lockEntry?.agents ?? [];
    const agentFilter = op.args.agents;
    const isPartialUninstall = agentFilter.length > 0;
    const agentsToRemove = isPartialUninstall ? agentFilter : lockAgents;

    // Remove agent symlinks/copies concurrently
    yield* Effect.forEach(
      agentsToRemove,
      (agentId) => {
        const maybeAgent = getAgentById(agentId);
        if (Option.isNone(maybeAgent)) return Effect.void;
        const agent = maybeAgent.value;

        const agentSkillPath = path.join(base, agent.skills.dir, sanitizedName);
        return fs
          .remove(agentSkillPath, { recursive: true })
          .pipe(Effect.catchAll(() => Effect.void));
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
              makeCliError({
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
        } satisfies OperationResult;
      }
      // Fall through to full uninstall if no agents remain
    }

    // Check if a pack still references this skill
    const lockedPacks = yield* ws.getLockedPacks().pipe(Effect.catchAll(() => Effect.succeed({})));
    const fqn = getSkillFqn(op.args.skillName, lockEntry);
    const packOwned = fqn !== undefined && isReferencedByPack(fqn, lockedPacks);

    if (packOwned) {
      // Pack still references this skill — remove from settings only, keep lockfile + disk
      yield* ws.removeSkillFromSettings(op.args.skillName).pipe(Effect.catchAll(() => Effect.void));

      return {
        result: "success",
        message: `Uninstalled ${op.args.skillName}`,
      } satisfies OperationResult;
    }

    // Full uninstall: remove from all known canonical locations
    if (installedOnDisk) {
      yield* removeFromAllCanonicalLocations(fs, base, sanitizedName, path);
    }

    // Remove from both settings and lockfile (swallow errors on full uninstall)
    yield* ws.removeSkill(op.args.skillName).pipe(Effect.catchAll(() => Effect.void));

    return {
      result: "success",
      message: `Uninstalled ${op.args.skillName}`,
    } satisfies OperationResult;
  });
