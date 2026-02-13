/**
 * Enable skill executor — re-installs files for a previously disabled skill.
 *
 * Pipeline: read state → resolve source → copy to canonical → create symlinks →
 * update lock agents → update settings entry.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { getAgentById } from "../../../agents/registry.js";
import { makeCliError } from "../../../cli-error/index.js";
import { Log } from "../../../tui/index.js";
import { createSymlink } from "../../../utils/create-symlink.js";
import type { OperationHandler } from "../../../workspace/apply-plan.js";
import type { OperationResult } from "../../../workspace/plan.js";
import { Workspace } from "../../../workspace/service.js";
import { copySkillDirectory } from "../copy-skill-directory.js";
import { UNIVERSAL_SKILLS_DIR } from "../constants.js";
import { removeIfExists } from "../fs-helpers.js";
import { sanitizeName } from "../install/skill-utils.js";
import type { EnableSkillOperation } from "../operations.js";

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Enable-skill operation handler.
 *
 * 1. Read configured agents, lock entry, settings entry
 * 2. Determine canonical path from lock entry type
 * 3. Copy source files to canonical location
 * 4. Create agent symlinks (concurrent)
 * 5. Update lock agents
 * 6. Update settings entry to set enabled: true
 */
export const enableSkill: OperationHandler<
  EnableSkillOperation,
  FileSystem.FileSystem | Path.Path | Workspace | Log
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;
    const axmDir = ws.path;
    const base = path.dirname(axmDir);

    const sanitizedName = sanitizeName(op.args.skillName);

    // 1. Read workspace state
    const configuredAgents = yield* ws.getConfiguredAgents();

    const lockEntryOption = yield* ws.getLockedSkill(op.args.skillName).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "ENABLE_SKILL_LOCKFILE_READ_FAILED",
          what: `Failed to read lockfile: ${e.what}`,
          cause: e,
        }),
      ),
    );
    if (Option.isNone(lockEntryOption)) {
      return yield* makeCliError({
        code: "ENABLE_SKILL_NOT_FOUND",
        what: `Lock entry for "${op.args.skillName}" not found in lockfile`,
      });
    }
    const lockEntry = lockEntryOption.value;

    // 2. Determine canonical path via centralized getSkillDir (name-only mode — uses lockfile)
    const { canonicalPath, skillSrcPath } = yield* ws.getSkillDir(op.args.skillName);

    // 3. Resolve source and copy to canonical location
    // For local sources, the lock entry path is the source repo root;
    // the individual skill lives at repo-root/skill-name
    if (lockEntry.type === "local") {
      const sourcePath = path.join(lockEntry.path, sanitizedName);

      // Pre-clean canonical location
      yield* removeIfExists(fs, canonicalPath);

      yield* copySkillDirectory(sourcePath, skillSrcPath).pipe(
        Effect.mapError((e) =>
          makeCliError({
            code: "ENABLE_SKILL_COPY_FAILED",
            what: `Failed to copy skill files to ${skillSrcPath}`,
            cause: e,
          }),
        ),
      );
    } else if (lockEntry.type === "registry") {
      // For registry sources, the canonical path should already exist from prior install
      // or needs re-resolution through SourceProviders (not available in this handler).
      // If files don't exist, fail with a helpful message.
      const exists = yield* fs
        .exists(canonicalPath)
        .pipe(Effect.catchAll(() => Effect.succeed(false)));
      if (!exists) {
        return yield* makeCliError({
          code: "ENABLE_SKILL_MISSING_FILES",
          what: `Skill files for "${op.args.skillName}" not found at ${canonicalPath}`,
          howToFix: "Try reinstalling the skill with `axm skills install`",
        });
      }
    } else {
      // For git-based sources (github, gitlab, etc.), use the path from lock entry
      const sourcePath = "path" in lockEntry ? (lockEntry as { path?: string }).path : undefined;
      if (sourcePath) {
        yield* removeIfExists(fs, canonicalPath);
        yield* copySkillDirectory(sourcePath, skillSrcPath).pipe(
          Effect.mapError((e) =>
            makeCliError({
              code: "ENABLE_SKILL_COPY_FAILED",
              what: `Failed to copy skill files to ${skillSrcPath}`,
              cause: e,
            }),
          ),
        );
      } else {
        // Git sources without a local path need re-resolution
        return yield* makeCliError({
          code: "ENABLE_SKILL_MISSING_FILES",
          what: `Cannot re-resolve source for "${op.args.skillName}"`,
          howToFix: "Try reinstalling the skill with `axm skills install`",
        });
      }
    }

    // 4. Create agent symlinks (concurrent)
    yield* Effect.forEach(
      configuredAgents,
      (agentId) => {
        const maybeAgent = getAgentById(agentId);
        if (Option.isNone(maybeAgent)) return Effect.void;
        const agent = maybeAgent.value;

        // Self-reference detection
        const agentSkillsDir = path.resolve(base, agent.skills.dir);
        const canonicalSkillsDir = path.resolve(base, UNIVERSAL_SKILLS_DIR);
        if (agentSkillsDir === canonicalSkillsDir) return Effect.void;

        const agentSkillPath = path.join(base, agent.skills.dir, sanitizedName);
        return createSymlink({ target: skillSrcPath, link: agentSkillPath }).pipe(
          Effect.catchAll(() =>
            copySkillDirectory(skillSrcPath, agentSkillPath).pipe(
              Effect.catchAll(() => Effect.void),
            ),
          ),
        );
      },
      { concurrency: "unbounded" },
    );

    // 5. Update lock agents
    yield* ws
      .updateLockEntryAgents(op.args.skillName, configuredAgents)
      .pipe(Effect.catchAll(() => Effect.void));

    // 6. Update settings entry to set enabled: true
    yield* ws
      .updateSkillEntry(op.args.skillName, (e) => ({ ...e, enabled: true }))
      .pipe(Effect.catchAll(() => Effect.void));

    return {
      result: "success",
      message: `Enabled ${op.args.skillName}`,
    } satisfies OperationResult;
  });
