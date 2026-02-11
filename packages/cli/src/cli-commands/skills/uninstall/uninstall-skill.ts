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
import { OperationError, type OperationHandler } from "../../../workspace/apply-plan.js";
import type { OperationResult } from "../../../workspace/plan.js";
import { Workspace } from "../../../workspace/service.js";
import type { UninstallSkillOperation } from "../operations.js";
import { sanitizeName } from "../install/skill-utils.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const CANONICAL_SKILLS_DIR = ".agents/skills";
const REGISTRY_EXTENSIONS_DIR = ".axm/extensions";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Remove a directory if it exists, ignoring errors.
 */
const removeIfExists = (fsService: FileSystem.FileSystem, dirPath: string) =>
  fsService.exists(dirPath).pipe(
    Effect.catchAll(() => Effect.succeed(false)),
    Effect.flatMap((exists) =>
      exists ? fsService.remove(dirPath, { recursive: true }).pipe(Effect.ignore) : Effect.void,
    ),
  );

/**
 * Remove a skill from ALL known canonical locations.
 *
 * Ensures clean removal regardless of where the skill was installed:
 * 1. `.agents/skills/<name>/` (non-registry canonical)
 * 2. `.axm/extensions/<scope>/skills/<name>/` (registry canonical, any scope)
 */
const removeFromAllLocations = (
  fsService: FileSystem.FileSystem,
  base: string,
  sanitizedName: string,
  pathService: Path.Path,
) =>
  Effect.gen(function* () {
    // Remove from non-registry canonical location
    yield* removeIfExists(fsService, pathService.join(base, CANONICAL_SKILLS_DIR, sanitizedName));

    // Remove from any registry canonical location
    const extensionsDir = pathService.join(base, REGISTRY_EXTENSIONS_DIR);
    const extensionsDirExists = yield* fsService
      .exists(extensionsDir)
      .pipe(Effect.catchAll(() => Effect.succeed(false)));

    if (extensionsDirExists) {
      const scopeDirs = yield* fsService
        .readDirectory(extensionsDir)
        .pipe(Effect.catchAll(() => Effect.succeed<ReadonlyArray<string>>([])));

      yield* Effect.forEach(
        scopeDirs,
        (scopeDir) => {
          if (!scopeDir.startsWith("@")) return Effect.void;
          const skillPath = pathService.join(extensionsDir, scopeDir, "skills", sanitizedName);
          return removeIfExists(fsService, skillPath);
        },
        { concurrency: "unbounded" },
      );
    }
  });

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
      .exists(pathService.join(base, CANONICAL_SKILLS_DIR, sanitizedName))
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

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Uninstall-skill operation handler.
 *
 * Reads workspace paths from the Workspace service, then orchestrates:
 * 1. Sanitize skill name for filesystem
 * 2. Read lockfile to determine installed agents
 * 3. Remove agent symlinks concurrently (skip missing, skip self-reference)
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
    const axmDir = ws.path;
    const base = path.dirname(axmDir);

    const sanitizedName = sanitizeName(op.args.skillName);

    // Read lockfile entry for this skill via Workspace
    const lockEntryOption = yield* ws.getLockedSkill(op.args.skillName).pipe(
      Effect.mapError(
        (e) =>
          new OperationError({
            operation: "uninstall-skill",
            message: `Failed to read lockfile: ${e.message}`,
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

        // Self-reference detection: agent's skills.dir resolves to canonical location
        const agentSkillsDir = path.resolve(base, agent.skills.dir);
        const canonicalSkillsDir = path.resolve(base, CANONICAL_SKILLS_DIR);
        if (agentSkillsDir === canonicalSkillsDir) return Effect.void;

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
        const installedSkills = yield* ws.getInstalledSkills().pipe(
          Effect.mapError(
            (e) =>
              new OperationError({
                operation: "uninstall-skill",
                message: `Failed to read settings: ${e.message}`,
                cause: e,
              }),
          ),
        );
        const currentSource = installedSkills[op.args.skillName] ?? lockEntry.type;
        yield* ws
          .setSkill(op.args.skillName, currentSource, {
            ...lockEntry,
            agents: remainingAgents,
          })
          .pipe(
            Effect.mapError(
              (e) =>
                new OperationError({
                  operation: "uninstall-skill",
                  message: `Failed to update lockfile: ${e.message}`,
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

    // Full uninstall: remove from all known canonical locations
    if (installedOnDisk) {
      yield* removeFromAllLocations(fs, base, sanitizedName, path);
    }

    // Remove from both settings and lockfile (swallow errors on full uninstall)
    yield* ws.removeSkill(op.args.skillName).pipe(Effect.catchAll(() => Effect.void));

    return {
      result: "success",
      message: `Uninstalled ${op.args.skillName}`,
    } satisfies OperationResult;
  });
