/**
 * Disable skill executor — removes files but keeps settings/lockfile entry.
 *
 * Pipeline: read state → remove agent symlinks → remove canonical dir →
 * clear lock agents → update settings entry.
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
import { UNIVERSAL_SKILLS_DIR, REGISTRY_EXTENSIONS_DIR } from "../constants.js";
import { removeIfExists } from "../fs-helpers.js";
import { sanitizeName } from "../install/skill-utils.js";
import type { DisableSkillOperation } from "../operations.js";

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Disable-skill operation handler.
 *
 * 1. Read configured agents, lock entry
 * 2. Determine canonical path from lock entry type
 * 3. Remove agent symlinks (concurrent)
 * 4. Remove canonical directories
 * 5. Clear lock agents
 * 6. Update settings entry to set enabled: false
 */
export const disableSkill: OperationHandler<
  DisableSkillOperation,
  FileSystem.FileSystem | Path.Path | Workspace
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
          code: "DISABLE_SKILL_LOCKFILE_READ_FAILED",
          what: `Failed to read lockfile: ${e.what}`,
          cause: e,
        }),
      ),
    );
    if (Option.isNone(lockEntryOption)) {
      return yield* makeCliError({
        code: "DISABLE_SKILL_NOT_FOUND",
        what: `Lock entry for "${op.args.skillName}" not found in lockfile`,
      });
    }
    const lockEntry = lockEntryOption.value;

    // Determine agents to remove from (lock entry agents + configured agents, deduplicated)
    const lockAgents: readonly string[] = lockEntry.agents;
    const allAgents = [...new Set([...lockAgents, ...configuredAgents])];

    // 2. Remove agent symlinks (concurrent) — files before state
    yield* Effect.forEach(
      allAgents,
      (agentId) => {
        const maybeAgent = getAgentById(agentId);
        if (Option.isNone(maybeAgent)) return Effect.void;
        const agent = maybeAgent.value;

        // Self-reference detection
        const agentSkillsDir = path.resolve(base, agent.skills.dir);
        const canonicalSkillsDir = path.resolve(base, UNIVERSAL_SKILLS_DIR);
        if (agentSkillsDir === canonicalSkillsDir) return Effect.void;

        const agentSkillPath = path.join(base, agent.skills.dir, sanitizedName);
        return fs
          .remove(agentSkillPath, { recursive: true })
          .pipe(Effect.catchAll(() => Effect.void));
      },
      { concurrency: "unbounded" },
    );

    // 3. Remove canonical directories (from all known locations)
    yield* removeIfExists(fs, path.join(base, UNIVERSAL_SKILLS_DIR, sanitizedName));

    // Also remove from registry locations if applicable
    const extensionsDir = path.join(base, REGISTRY_EXTENSIONS_DIR);
    const extensionsDirExists = yield* fs
      .exists(extensionsDir)
      .pipe(Effect.catchAll(() => Effect.succeed(false)));

    if (extensionsDirExists) {
      const scopeDirs = yield* fs
        .readDirectory(extensionsDir)
        .pipe(Effect.catchAll(() => Effect.succeed<ReadonlyArray<string>>([])));

      yield* Effect.forEach(
        scopeDirs,
        (scopeDir) => {
          if (!scopeDir.startsWith("@")) return Effect.void;
          const skillPath = path.join(extensionsDir, scopeDir, "skills", sanitizedName);
          return removeIfExists(fs, skillPath);
        },
        { concurrency: "unbounded" },
      );
    }

    // 4. Clear lock agents — state updates after files
    yield* ws.updateLockEntryAgents(op.args.skillName, []).pipe(Effect.catchAll(() => Effect.void));

    // 5. Update settings entry to set enabled: false
    yield* ws
      .updateSkillEntry(op.args.skillName, (e) => ({ ...e, enabled: false }))
      .pipe(Effect.catchAll(() => Effect.void));

    return {
      result: "success",
      message: `Disabled ${op.args.skillName}`,
    } satisfies OperationResult;
  });
