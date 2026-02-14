/**
 * Enable skill executor — re-creates agent symlinks for a previously disabled skill.
 *
 * Pipeline: read state → verify canonical dir exists → create symlinks →
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
import { createSymlink } from "../../../utils/create-symlink.js";
import type { OperationHandler } from "../../../workspace/apply-plan.js";
import type { OperationResult } from "../../../workspace/plan.js";
import { Workspace } from "../../../workspace/service.js";
import { copySkillDirectory } from "../copy-skill-directory.js";
import { sanitizeName } from "../install/skill-utils.js";
import type { EnableSkillOperation } from "../operations.js";

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Enable-skill operation handler.
 *
 * 1. Read configured agents, lock entry
 * 2. Compute canonical path via getSkillDir (uses lockfile)
 * 3. Verify canonical directory exists
 * 4. Create agent symlinks (concurrent)
 * 5. Update lock agents
 * 6. Update settings entry to set enabled: true
 */
export const enableSkill: OperationHandler<
  EnableSkillOperation,
  FileSystem.FileSystem | Path.Path | Workspace
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;
    const base = path.dirname(ws.path);

    const sanitizedName = sanitizeName(op.args.skillName);

    // 1. Read workspace state
    const configuredAgents = yield* ws.getConfiguredAgents();

    // 2. Compute canonical path via getSkillDir (name-only mode — uses lockfile)
    const { skillSrcPath } = yield* ws.getSkillDir(op.args.skillName);

    // 3. Verify canonical directory exists
    const exists = yield* fs
      .exists(skillSrcPath)
      .pipe(Effect.catchAll(() => Effect.succeed(false)));
    if (!exists) {
      return yield* makeCliError({
        code: "ENABLE_SKILL_MISSING_FILES",
        what: `Skill files for "${op.args.skillName}" not found at ${skillSrcPath}`,
        howToFix: "Try reinstalling the skill with `axm skills install`",
      });
    }

    // 4. Create agent symlinks (concurrent)
    yield* Effect.forEach(
      configuredAgents,
      (agentId) => {
        const maybeAgent = getAgentById(agentId);
        if (Option.isNone(maybeAgent)) return Effect.void;
        const agent = maybeAgent.value;

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
