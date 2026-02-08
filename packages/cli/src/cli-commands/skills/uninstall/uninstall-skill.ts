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
import { removeLockEntry, updateLockEntry } from "../../../lockfile/lockfile.js";
import { OperationError, type OperationHandler } from "../../../workspace/apply-plan.js";
import type { OperationResult } from "../../../workspace/plan.js";
import { SettingsService } from "../../../settings/index.js";
import { Workspace } from "../../../workspace/service.js";
import type { SkillsLockMap } from "../../../lockfile/schema.js";
import type { UninstallSkillOperation } from "../operations.js";
import { sanitizeName } from "../install/skill-utils.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const CANONICAL_SKILLS_DIR = ".agents/skills";

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
 * 4. Remove canonical directory (full uninstall only)
 * 5. Remove or update lockfile entry
 */
export const uninstallSkill: OperationHandler<
  UninstallSkillOperation,
  FileSystem.FileSystem | Path.Path | Workspace | SettingsService
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;
    const axmDir = ws.path;
    const base = path.dirname(axmDir);

    const sanitizedName = sanitizeName(op.args.skillName);
    const canonicalPath = path.join(base, CANONICAL_SKILLS_DIR, sanitizedName);

    // Read lockfile to get agent list (missing lockfile → empty, corrupt → propagate)
    const lockfile = yield* ws.getLockfile().pipe(
      Effect.catchTag("LockfileNotFoundError", () =>
        Effect.succeed({ lockfileVersion: 1, skills: {} as SkillsLockMap }),
      ),
      Effect.mapError(
        (e) =>
          new OperationError({
            operation: "uninstall-skill",
            message: `Failed to read lockfile: ${e.message}`,
            cause: e,
          }),
      ),
    );
    const lockEntry = lockfile.skills[op.args.skillName];

    // Determine if skill is installed anywhere
    const canonicalExists = yield* fs
      .exists(canonicalPath)
      .pipe(Effect.catchAll(() => Effect.succeed(false)));

    if (!lockEntry && !canonicalExists) {
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
        // Update lockfile entry with remaining agents
        yield* updateLockEntry(axmDir, op.args.skillName, {
          ...lockEntry,
          agents: remainingAgents,
        }).pipe(
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

    // Full uninstall: remove canonical dir
    if (canonicalExists) {
      yield* fs.remove(canonicalPath, { recursive: true }).pipe(Effect.catchAll(() => Effect.void));
    }

    // Remove lockfile entry
    if (lockEntry) {
      yield* removeLockEntry(axmDir, op.args.skillName).pipe(
        Effect.mapError(
          (e) =>
            new OperationError({
              operation: "uninstall-skill",
              message: `Failed to remove lockfile entry: ${e.message}`,
              cause: e,
            }),
        ),
      );
    }

    // Update settings (swallow errors) — only on full uninstall
    const ss = yield* SettingsService;
    yield* ss.removeSkill(op.args.skillName).pipe(Effect.catchAll(() => Effect.void));

    return {
      result: "success",
      message: `Uninstalled ${op.args.skillName}`,
    } satisfies OperationResult;
  });
