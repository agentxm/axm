/**
 * Enable skill executor — re-creates agent symlinks for a previously disabled skill.
 *
 * Two paths:
 * - Lock entry present: full enable (symlinks + lock agents + settings)
 * - No lock entry: settings-only toggle (configured skill with no lock backing)
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { getAgentById } from "../../../agents/registry.js";
import { makeAppError } from "../../../app-error/index.js";
import { createSymlink } from "../../../utils/create-symlink.js";
import type { OperationHandler } from "../../../workspace/apply-plan.js";
import type { Operation, OperationResult } from "../../../workspace/plan.js";
import { Workspace } from "../../../workspace/service.js";
import { copySkillDirectory } from "./copy-directory.js";
import { sanitizeName } from "../utils.js";

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Enable a previously disabled skill (re-install files and update state).
 *
 * @experimental This API is unstable and may change without notice.
 */
export type EnableSkillOperation = Operation<"enable-skill", { readonly skillName: string }>;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Enable-skill operation handler.
 *
 * Lock-backed path:
 * 1. Read configured agents, lock entry
 * 2. Compute canonical path via getSkillDir (uses lockfile)
 * 3. Verify canonical directory exists
 * 4. Create agent symlinks (concurrent)
 * 5. Update lock agents
 * 6. Update settings entry to set enabled: true
 *
 * Settings-only path (no lock entry):
 * 1. Update settings entry to set enabled: true
 */
export const enableSkill: OperationHandler<
  EnableSkillOperation,
  FileSystem.FileSystem | Path.Path | Workspace
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;
    const base = ws.baseDir;

    // Check for lock entry to determine path
    const lockEntry = yield* ws.getLockedSkill(op.args.skillName);

    // Settings-only path: no lock entry, just toggle enabled flag
    if (Option.isNone(lockEntry)) {
      yield* ws
        .updateSkillEntry(op.args.skillName, (e) => ({ ...e, enabled: true }))
        .pipe(Effect.catch(() => Effect.void));

      return {
        result: "success",
        message: `Enabled ${op.args.skillName}`,
      } satisfies OperationResult;
    }

    // Lock-backed path: full enable with symlinks
    const sanitizedName = sanitizeName(op.args.skillName);
    const configuredAgents = yield* ws.getConfiguredAgents();

    const { skillSrcPath } = yield* ws.getSkillDir(op.args.skillName);

    const exists = yield* fs.exists(skillSrcPath).pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) {
      return yield* makeAppError({
        code: "ENABLE_SKILL_MISSING_FILES",
        what: `Skill files for "${op.args.skillName}" not found at ${skillSrcPath}`,
        howToFix: "Try reinstalling the skill with `axm skills install`",
      });
    }

    yield* Effect.forEach(
      configuredAgents,
      (agentId) => {
        const maybeAgent = getAgentById(agentId);
        if (Option.isNone(maybeAgent)) return Effect.void;
        const agent = maybeAgent.value;

        const agentSkillPath = path.join(base, agent.skills.dir, sanitizedName);
        return createSymlink({ target: skillSrcPath, link: agentSkillPath }).pipe(
          Effect.catch(() =>
            copySkillDirectory(skillSrcPath, agentSkillPath).pipe(Effect.catch(() => Effect.void)),
          ),
        );
      },
      { concurrency: "unbounded" },
    );

    yield* ws
      .updateLockEntryAgents(op.args.skillName, configuredAgents)
      .pipe(Effect.catch(() => Effect.void));

    yield* ws
      .updateSkillEntry(op.args.skillName, (e) => ({ ...e, enabled: true }))
      .pipe(Effect.catch(() => Effect.void));

    return {
      result: "success",
      message: `Enabled ${op.args.skillName}`,
    } satisfies OperationResult;
  });
