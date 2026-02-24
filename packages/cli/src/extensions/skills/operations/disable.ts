/**
 * Disable skill executor — removes agent symlinks but preserves canonical files.
 *
 * Three paths:
 * - Lock entry present: full disable (remove symlinks + clear lock agents + settings)
 * - No lock entry, configured: settings-only toggle
 * - No lock entry, implicit: promote to configured entry with enabled: false
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
import type { Operation, OperationResult } from "../../../workspace/plan.js";
import { Workspace } from "../../../workspace/service.js";
import type { SkillLockEntry } from "../../../lockfile/schema.js";
import { sanitizeName } from "../utils.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Derive a source string from lock entry metadata for implicit skill promotion. */
const deriveSourceString = (lockEntry: SkillLockEntry): string => {
  switch (lockEntry.type) {
    case "local":
      return lockEntry.path;
    case "registry":
      return lockEntry.name;
    case "github":
      return `${lockEntry.owner}/${lockEntry.repo}`;
    case "gitlab":
      return `${lockEntry.owner}/${lockEntry.repo}`;
    case "bitbucket":
      return `${lockEntry.owner}/${lockEntry.repo}`;
    case "azurerepos":
      return `${lockEntry.organization}/${lockEntry.project}/${lockEntry.repo}`;
    case "git":
      return lockEntry.url;
    case "builtin":
      return "builtin";
  }
};

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Disable a skill (remove files but keep settings/lockfile entry).
 *
 * @experimental This API is unstable and may change without notice.
 */
export type DisableSkillOperation = Operation<"disable-skill", { readonly skillName: string }>;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Disable-skill operation handler.
 *
 * Determines lifecycle via getInstalledSkills, then branches:
 *
 * Implicit skill → promote to configured entry with enabled: false
 *   - If lock entry exists: also remove symlinks + clear lock agents
 *   - If no lock entry: settings promotion only
 *
 * Configured skill with lock entry → full lock-backed disable
 *   - Remove symlinks, clear lock agents, update settings
 *
 * Configured skill without lock entry → settings-only toggle
 *
 * Canonical files are preserved for later re-enablement.
 */
export const disableSkill: OperationHandler<
  DisableSkillOperation,
  FileSystem.FileSystem | Path.Path | Workspace
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;
    const base = ws.baseDir;

    // Read lifecycle to determine promotion needs
    const installedSkills = yield* ws.getInstalledSkills();
    const installed = installedSkills[op.args.skillName];
    const isImplicit = installed !== undefined && installed.lifecycle === "implicit";

    // Check for lock entry
    const lockEntryOption = yield* ws.getLockedSkill(op.args.skillName).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "DISABLE_SKILL_LOCKFILE_READ_FAILED",
          what: `Failed to read lockfile: ${e.what}`,
          cause: e,
        }),
      ),
    );
    const hasLockEntry = Option.isSome(lockEntryOption);

    // Lock-backed file operations (when lock entry exists)
    if (hasLockEntry) {
      const lockEntry = lockEntryOption.value;
      const sanitizedName = sanitizeName(op.args.skillName);
      const configuredAgents = yield* ws.getConfiguredAgents();

      const lockAgents: readonly string[] = lockEntry.agents;
      const allAgents = [...new Set([...lockAgents, ...configuredAgents])];

      // Remove agent symlinks (concurrent) — files before state
      yield* Effect.forEach(
        allAgents,
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

      // Clear lock agents — state updates after files
      yield* ws
        .updateLockEntryAgents(op.args.skillName, [])
        .pipe(Effect.catchAll(() => Effect.void));
    }

    // State mutation: implicit promotion or configured toggle
    if (isImplicit) {
      // Implicit promotion: derive source via deterministic fallback order
      // 1. installed entry source  2. lock entry metadata  3. fail
      const source = Option.getOrElse(installed.source, () =>
        hasLockEntry ? deriveSourceString(lockEntryOption.value) : undefined,
      );
      if (source === undefined) {
        return yield* makeCliError({
          code: "DISABLE_SKILL_NO_SOURCE",
          what: `Cannot determine source for implicit skill "${op.args.skillName}"`,
          howToFix: "Provide a source when disabling this skill",
        });
      }
      yield* ws.setSkillEntry(op.args.skillName, { source, enabled: false });
    } else {
      // Configured skill — toggle enabled flag
      yield* ws
        .updateSkillEntry(op.args.skillName, (e) => ({ ...e, enabled: false }))
        .pipe(Effect.catchAll(() => Effect.void));
    }

    return {
      result: "success",
      message: `Disabled ${op.args.skillName}`,
    } satisfies OperationResult;
  });
