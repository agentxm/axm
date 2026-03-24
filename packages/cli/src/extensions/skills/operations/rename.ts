/**
 * Rename skill executor — renames files and updates settings/lockfile keys.
 *
 * Pipeline: read state → rename canonical dir → remove old symlinks →
 * create new symlinks → rename settings/lockfile keys → sync lock agents.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import matter from "gray-matter";
import { getAgentById } from "../../../agents/registry.js";
import { makeAppError } from "../../../app-error/index.js";
import { createSymlink } from "../../../utils/create-symlink.js";
import { copySkillDirectory } from "./copy-directory.js";
import type { OperationHandler } from "../../../workspace/apply-plan.js";
import type { Operation, OperationResult } from "../../../workspace/plan.js";
import { Workspace } from "../../../workspace/service.js";
import type { SkillPathSource } from "../paths.js";
import { sanitizeName } from "../utils.js";

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Rename a skill (rename files and update settings/lockfile keys).
 *
 * @experimental This API is unstable and may change without notice.
 */
export type RenameSkillOperation = Operation<
  "rename-skill",
  { readonly oldName: string; readonly newName: string }
>;

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
    const base = ws.baseDir;

    // 1. Read workspace state
    const configuredAgents = yield* ws.getConfiguredAgents();

    const lockEntryOption = yield* ws.getLockedSkill(op.args.oldName).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "RENAME_SKILL_LOCKFILE_READ_FAILED",
          what: `Failed to read lockfile: ${e.what}`,
          cause: e,
        }),
      ),
    );
    if (Option.isNone(lockEntryOption)) {
      return yield* makeAppError({
        code: "RENAME_SKILL_NOT_FOUND",
        what: `Lock entry for "${op.args.oldName}" not found in lockfile`,
      });
    }
    const lockEntry = lockEntryOption.value;
    const lockAgents: readonly string[] = lockEntry.agents;

    // 2. Compute paths for old and new names via centralized getSkillDir
    // Derive source from lock entry — new name doesn't exist in lockfile yet
    const pathSource: SkillPathSource =
      lockEntry.type === "registry"
        ? { refType: "registry", namespace: lockEntry.namespace }
        : lockEntry.type === "local"
          ? { refType: "local" }
          : lockEntry.type === "builtin"
            ? { refType: "builtin" }
            : { refType: "git-hosted" };
    const oldPaths = yield* ws.getSkillDir(op.args.oldName, pathSource);

    // Registry directories are tied to the immutable registry name — no rename needed
    const isRegistry = lockEntry.type === "registry";
    const newPaths = isRegistry ? oldPaths : yield* ws.getSkillDir(op.args.newName, pathSource);

    if (!isRegistry) {
      // Rename canonical directory — files before state
      yield* fs.rename(oldPaths.canonicalPath, newPaths.canonicalPath).pipe(
        Effect.mapError((e) =>
          makeAppError({
            code: "RENAME_SKILL_DIR_FAILED",
            what: `Failed to rename skill directory from "${op.args.oldName}" to "${op.args.newName}"`,
            cause: e,
          }),
        ),
      );
    }

    // 2b. Update SKILL.md frontmatter name — best-effort
    yield* updateSkillMdName(
      fs,
      path.join(newPaths.skillSrcPath, "SKILL.md"),
      op.args.newName,
    ).pipe(Effect.catch(() => Effect.void));

    // 3. Remove old agent symlinks (concurrent)
    const oldSanitized = sanitizeName(op.args.oldName);
    const newSanitized = sanitizeName(op.args.newName);
    const allAgents = [...new Set([...lockAgents, ...configuredAgents])];
    yield* Effect.forEach(
      allAgents,
      (agentId) => {
        const maybeAgent = getAgentById(agentId);
        if (Option.isNone(maybeAgent)) return Effect.void;
        const agent = maybeAgent.value;

        const agentSkillPath = path.join(base, agent.skills.dir, oldSanitized);
        return fs.remove(agentSkillPath, { recursive: true }).pipe(Effect.catch(() => Effect.void));
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

        const agentSkillPath = path.join(base, agent.skills.dir, newSanitized);
        return createSymlink({ target: newPaths.skillSrcPath, link: agentSkillPath }).pipe(
          Effect.catch(() =>
            copySkillDirectory(newPaths.skillSrcPath, agentSkillPath).pipe(
              Effect.catch(() => Effect.void),
            ),
          ),
        );
      },
      { concurrency: "unbounded" },
    );

    // 5. Rename settings/lockfile keys — state after files
    yield* ws.renameSkill(op.args.oldName, op.args.newName).pipe(Effect.catch(() => Effect.void));

    // 6. Sync lock agents
    yield* ws
      .updateLockEntryAgents(op.args.newName, configuredAgents)
      .pipe(Effect.catch(() => Effect.void));

    return {
      result: "success",
      message: `Renamed ${op.args.oldName} to ${op.args.newName}`,
    } satisfies OperationResult;
  });

// -----------------------------------------------------------------------------
// Internal
// -----------------------------------------------------------------------------

/** Update the `name` field in a SKILL.md's YAML frontmatter. */
const updateSkillMdName = (fs: FileSystem.FileSystem, skillMdPath: string, newName: string) =>
  Effect.gen(function* () {
    const content = yield* fs.readFileString(skillMdPath);
    const parsed = matter(content);
    if (typeof parsed.data["name"] !== "string") return;
    parsed.data["name"] = newName;
    yield* fs.writeFileString(skillMdPath, matter.stringify(parsed.content, parsed.data));
  });
