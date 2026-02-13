/**
 * Rename skill executor — renames files and updates settings/lockfile keys.
 *
 * Pipeline: read state → rename canonical dir → remove old symlinks →
 * create new symlinks → rename settings/lockfile keys → sync lock agents.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { getAgentById } from "../../../agents/registry.js";
import { makeCliError } from "../../../cli-error/index.js";
import { createSymlink } from "../../../utils/create-symlink.js";
import { copySkillDirectory } from "../copy-skill-directory.js";
import type { OperationHandler } from "../../../workspace/apply-plan.js";
import type { OperationResult } from "../../../workspace/plan.js";
import { Workspace } from "../../../workspace/service.js";
import { CANONICAL_SKILLS_DIR } from "../constants.js";
import type { RenameSkillOperation } from "../operations.js";
import { sanitizeName } from "../install/skill-utils.js";

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Rename-skill operation handler.
 *
 * 1. Read configured agents, lock entry, settings entry (all by old name)
 * 2. Rename canonical directory (old -> new)
 * 3. Remove old agent symlinks
 * 4. Create new agent symlinks
 * 5. Rename settings/lockfile keys
 * 6. Sync lock agents
 */
export const renameSkill: OperationHandler<
  RenameSkillOperation,
  FileSystem.FileSystem | Path.Path | Workspace
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;
    const axmDir = ws.path;
    const base = path.dirname(axmDir);

    const oldSanitized = sanitizeName(op.args.oldName);
    const newSanitized = sanitizeName(op.args.newName);

    // 1. Read workspace state
    const configuredAgents = yield* ws.getConfiguredAgents();

    const lockEntryOption = yield* ws.getLockedSkill(op.args.oldName).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "RENAME_SKILL_LOCKFILE_READ_FAILED",
          what: `Failed to read lockfile: ${e.what}`,
          cause: e,
        }),
      ),
    );
    if (Option.isNone(lockEntryOption)) {
      return yield* makeCliError({
        code: "RENAME_SKILL_NOT_FOUND",
        what: `Lock entry for "${op.args.oldName}" not found in lockfile`,
      });
    }
    const lockEntry = lockEntryOption.value;
    const lockAgents: readonly string[] = lockEntry.agents;

    // 2. Rename canonical directory — files before state
    const oldCanonical = path.join(base, CANONICAL_SKILLS_DIR, oldSanitized);
    const newCanonical = path.join(base, CANONICAL_SKILLS_DIR, newSanitized);

    yield* fs.rename(oldCanonical, newCanonical).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "RENAME_SKILL_DIR_FAILED",
          what: `Failed to rename skill directory from "${oldSanitized}" to "${newSanitized}"`,
          cause: e,
        }),
      ),
    );

    // Content path for symlinks (non-registry sources: same as canonical)
    const contentPath = newCanonical;

    // 3. Remove old agent symlinks (concurrent)
    const allAgents = [...new Set([...lockAgents, ...configuredAgents])];
    yield* Effect.forEach(
      allAgents,
      (agentId) => {
        const maybeAgent = getAgentById(agentId);
        if (Option.isNone(maybeAgent)) return Effect.void;
        const agent = maybeAgent.value;

        // Self-reference detection
        const agentSkillsDir = path.resolve(base, agent.skills.dir);
        const canonicalSkillsDir = path.resolve(base, CANONICAL_SKILLS_DIR);
        if (agentSkillsDir === canonicalSkillsDir) return Effect.void;

        const agentSkillPath = path.join(base, agent.skills.dir, oldSanitized);
        return fs
          .remove(agentSkillPath, { recursive: true })
          .pipe(Effect.catchAll(() => Effect.void));
      },
      { concurrency: "unbounded" },
    );

    // 4. Create new agent symlinks (concurrent)
    yield* Effect.forEach(
      configuredAgents,
      (agentId) => {
        const maybeAgent = getAgentById(agentId);
        if (Option.isNone(maybeAgent)) return Effect.void;
        const agent = maybeAgent.value;

        // Self-reference detection
        const agentSkillsDir = path.resolve(base, agent.skills.dir);
        const canonicalSkillsDir = path.resolve(base, CANONICAL_SKILLS_DIR);
        if (agentSkillsDir === canonicalSkillsDir) return Effect.void;

        const agentSkillPath = path.join(base, agent.skills.dir, newSanitized);
        return createSymlink({ target: contentPath, link: agentSkillPath }).pipe(
          Effect.catchAll(() =>
            copySkillDirectory(contentPath, agentSkillPath).pipe(
              Effect.catchAll(() => Effect.void),
            ),
          ),
        );
      },
      { concurrency: "unbounded" },
    );

    // 5. Rename settings/lockfile keys — state after files
    yield* ws
      .renameSkill(op.args.oldName, op.args.newName)
      .pipe(Effect.catchAll(() => Effect.void));

    // 6. Sync lock agents
    yield* ws
      .updateLockEntryAgents(op.args.newName, configuredAgents)
      .pipe(Effect.catchAll(() => Effect.void));

    return {
      result: "success",
      message: `Renamed ${op.args.oldName} to ${op.args.newName}`,
    } satisfies OperationResult;
  });
