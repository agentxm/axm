/**
 * Apply logic for skills state - executes the diff/plan.
 *
 * This module handles the actual file operations to transform
 * actual state to match ideal state. It supports:
 * - Adding new skills (copy from source to canonical location)
 * - Removing skills (delete from canonical and agent locations)
 * - Updating skills (replace with new version)
 * - Syncing to agents (symlinks/copies)
 * - Updating settings and lockfile
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as nodePath from "node:path";
import { FileSystem, type Path } from "@effect/platform";
import { Data, Effect, Option } from "effect";

import { readLockfile, writeLockfile } from "../lockfile.js";
import { readSettings, writeSettings } from "../settings.js";
import type { AgentConfig, LockEntry, Skill } from "../types.js";
import { getChangesToApply } from "./diff.js";
import type { IdealSkill, SkillChange, SkillSource, SkillState, SkillsDiff } from "./types.js";

// =============================================================================
// Constants
// =============================================================================

const SKILLS_DIR = "skills";

// =============================================================================
// Error Types
// =============================================================================

/**
 * Error during apply operation.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class ApplyError extends Data.TaggedError("ApplyError")<{
  readonly message: string;
  readonly skillName: string;
  readonly operation: "add" | "remove" | "update" | "sync" | "lockfile" | "settings";
  readonly cause?: unknown;
  readonly retryable: boolean;
}> {}

// =============================================================================
// Progress Event Types
// =============================================================================

/**
 * Progress events emitted during apply.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ApplyProgressEvent =
  | { readonly _tag: "ApplyStart"; readonly totalChanges: number }
  | { readonly _tag: "SkillStart"; readonly skillName: string; readonly action: ApplyAction }
  | { readonly _tag: "SkillCopying"; readonly skillName: string }
  | { readonly _tag: "SkillSyncing"; readonly skillName: string; readonly agentId: string }
  | { readonly _tag: "SkillComplete"; readonly skillName: string; readonly success: boolean }
  | { readonly _tag: "LockfileUpdating" }
  | { readonly _tag: "SettingsUpdating" }
  | { readonly _tag: "ApplyComplete"; readonly applied: number; readonly failed: number };

/**
 * Action type for progress events.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ApplyAction = "add" | "remove" | "update" | "repair";

// =============================================================================
// Result Types
// =============================================================================

/**
 * Result of installing a single skill.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ApplySkillResult {
  readonly skillName: string;
  readonly canonicalPath: string;
  readonly agentResults: readonly AgentInstallResult[];
}

/**
 * Result of installing to a single agent.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface AgentInstallResult {
  readonly agentId: string;
  readonly path: string;
  readonly method: "symlink" | "copy";
}

/**
 * Result of removing a skill.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface RemoveSkillResult {
  readonly skillName: string;
  readonly removed: boolean;
}

/**
 * Failed apply operation.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ApplyFailure {
  readonly skillName: string;
  readonly action: ApplyAction;
  readonly error: ApplyError;
}

/**
 * Overall apply result.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ApplyResult {
  readonly applied: readonly ApplySkillResult[];
  readonly failed: readonly ApplyFailure[];
}

// =============================================================================
// Options Types
// =============================================================================

/**
 * Options for apply operations.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ApplyOptions {
  readonly axmDir: string;
  readonly agents: readonly AgentConfig[];
  readonly onProgress?: (event: ApplyProgressEvent) => void;
}

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Get the source path from a SkillSource.
 * Returns the local path for Local sources, throws for remote sources.
 */
const getSourcePath = (source: SkillSource): string => {
  switch (source._tag) {
    case "Local":
      return source.path;
    case "Git":
    case "WellKnown":
    case "Registry":
      // For remote sources, we need to fetch first (not implemented yet)
      // For now, throw an error
      throw new Error(`Remote source type ${source._tag} not yet supported in apply`);
  }
};

/**
 * Convert IdealSkill to Skill for the installer module.
 */
const _idealToSkill = (ideal: IdealSkill): Skill => {
  const base = {
    name: ideal.name,
    path: nodePath.join(getSourcePath(ideal.source), "SKILL.md"),
  };
  const description = Option.getOrUndefined(ideal.description);
  return description !== undefined ? { ...base, description } : base;
};

/**
 * Convert SkillSource to settings entry value.
 */
const sourceToSettingsValue = (source: SkillSource): string => {
  switch (source._tag) {
    case "Local":
      return source.path;
    case "Git":
      return source.url;
    case "WellKnown":
      return `${source.baseUrl}/${source.skillName}`;
    case "Registry":
      return `${source.name}@${source.version}`;
  }
};

/**
 * Convert IdealSkill to LockEntry.
 */
const idealToLockEntry = (ideal: IdealSkill): LockEntry => {
  const now = new Date().toISOString();
  return {
    source: sourceToSettingsValue(ideal.source),
    origin: getSourcePath(ideal.source),
    folderHash: ideal.gitTreeFolderHash,
    installedAt: now,
    updatedAt: now,
  };
};

/**
 * Copy directory recursively.
 */
const copyDirectory = (
  srcDir: string,
  destDir: string,
): Effect.Effect<void, ApplyError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    // Ensure destination exists
    yield* fs.makeDirectory(destDir, { recursive: true }).pipe(
      Effect.mapError(
        (error) =>
          new ApplyError({
            message: `Failed to create directory: ${destDir}`,
            skillName: "",
            operation: "add",
            cause: error,
            retryable: false,
          }),
      ),
    );

    // Read source directory entries
    const entries = yield* fs.readDirectory(srcDir).pipe(
      Effect.mapError(
        (error) =>
          new ApplyError({
            message: `Failed to read directory: ${srcDir}`,
            skillName: "",
            operation: "add",
            cause: error,
            retryable: false,
          }),
      ),
    );

    // Process each entry
    for (const entry of entries) {
      const srcPath = nodePath.join(srcDir, entry);
      const destPath = nodePath.join(destDir, entry);

      const stat = yield* fs.stat(srcPath).pipe(
        Effect.mapError(
          (error) =>
            new ApplyError({
              message: `Failed to stat: ${srcPath}`,
              skillName: "",
              operation: "add",
              cause: error,
              retryable: false,
            }),
        ),
      );

      if (stat.type === "Directory") {
        yield* copyDirectory(srcPath, destPath);
      } else {
        yield* fs.copyFile(srcPath, destPath).pipe(
          Effect.mapError(
            (error) =>
              new ApplyError({
                message: `Failed to copy file: ${srcPath}`,
                skillName: "",
                operation: "add",
                cause: error,
                retryable: false,
              }),
          ),
        );
      }
    }
  });

// =============================================================================
// Apply Functions
// =============================================================================

/**
 * Apply an Add change - copy skill to canonical location and sync to agents.
 *
 * @param ideal - The skill to add
 * @param options - Apply options
 * @returns Effect yielding the apply result
 *
 * @experimental This API is unstable and may change without notice.
 */
export const applyAdd = (
  ideal: IdealSkill,
  options: Pick<ApplyOptions, "axmDir" | "agents">,
): Effect.Effect<ApplySkillResult, ApplyError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const { axmDir, agents } = options;

    const sourcePath = getSourcePath(ideal.source);
    const skillsDir = nodePath.join(axmDir, SKILLS_DIR);
    const canonicalPath = nodePath.join(skillsDir, ideal.name);

    // Check if source exists
    const sourceExists = yield* fs.exists(sourcePath).pipe(
      Effect.mapError(
        (error) =>
          new ApplyError({
            message: `Failed to check source: ${sourcePath}`,
            skillName: ideal.name,
            operation: "add",
            cause: error,
            retryable: false,
          }),
      ),
    );

    if (!sourceExists) {
      return yield* new ApplyError({
        message: `Source directory does not exist: ${sourcePath}`,
        skillName: ideal.name,
        operation: "add",
        retryable: false,
      });
    }

    // Copy to canonical location
    yield* copyDirectory(sourcePath, canonicalPath).pipe(
      Effect.mapError(
        (error) =>
          new ApplyError({
            message: `Failed to copy skill to canonical location`,
            skillName: ideal.name,
            operation: "add",
            cause: error,
            retryable: false,
          }),
      ),
    );

    // Sync to agents
    const agentResults: AgentInstallResult[] = [];
    for (const agent of agents) {
      const agentSkillsDir = agent.skillsDir ?? nodePath.join(agent.detectPath, SKILLS_DIR);
      const symlinkPath = nodePath.join(agentSkillsDir, ideal.name);

      // Ensure agent skills directory exists
      yield* fs.makeDirectory(agentSkillsDir, { recursive: true }).pipe(
        Effect.mapError(
          (error) =>
            new ApplyError({
              message: `Failed to create agent skills directory: ${agentSkillsDir}`,
              skillName: ideal.name,
              operation: "sync",
              cause: error,
              retryable: false,
            }),
        ),
      );

      // Calculate relative path and create symlink
      const relativeTarget = nodePath.relative(agentSkillsDir, canonicalPath);

      // Remove existing if present
      const exists = yield* fs.exists(symlinkPath).pipe(Effect.orElse(() => Effect.succeed(false)));
      if (exists) {
        yield* fs.remove(symlinkPath, { recursive: true }).pipe(Effect.catchAll(() => Effect.void));
      }

      // Try symlink first, fall back to copy
      const symlinkResult = yield* fs.symlink(relativeTarget, symlinkPath).pipe(
        Effect.map(() => ({ method: "symlink" as const, path: symlinkPath })),
        Effect.catchAll(() =>
          copyDirectory(canonicalPath, symlinkPath).pipe(
            Effect.map(() => ({ method: "copy" as const, path: symlinkPath })),
          ),
        ),
      );

      agentResults.push({
        agentId: agent.id,
        path: symlinkResult.path,
        method: symlinkResult.method,
      });
    }

    return {
      skillName: ideal.name,
      canonicalPath,
      agentResults,
    };
  });

/**
 * Apply a Remove change - delete skill from canonical location and agent locations.
 *
 * @param state - The skill state to remove
 * @param options - Apply options
 * @returns Effect yielding the remove result
 *
 * @experimental This API is unstable and may change without notice.
 */
export const applyRemove = (
  state: SkillState,
  options: Pick<ApplyOptions, "axmDir" | "agents">,
): Effect.Effect<RemoveSkillResult, ApplyError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const { axmDir, agents } = options;

    const skillsDir = nodePath.join(axmDir, SKILLS_DIR);
    const canonicalPath = nodePath.join(skillsDir, state.name);

    // Remove from agents first
    for (const agent of agents) {
      const agentSkillsDir = agent.skillsDir ?? nodePath.join(agent.detectPath, SKILLS_DIR);
      const agentSkillPath = nodePath.join(agentSkillsDir, state.name);

      const exists = yield* fs
        .exists(agentSkillPath)
        .pipe(Effect.orElse(() => Effect.succeed(false)));
      if (exists) {
        yield* fs
          .remove(agentSkillPath, { recursive: true })
          .pipe(Effect.catchAll(() => Effect.void));
      }
    }

    // Remove from canonical location
    const canonicalExists = yield* fs
      .exists(canonicalPath)
      .pipe(Effect.orElse(() => Effect.succeed(false)));

    if (canonicalExists) {
      yield* fs.remove(canonicalPath, { recursive: true }).pipe(
        Effect.mapError(
          (error) =>
            new ApplyError({
              message: `Failed to remove skill: ${canonicalPath}`,
              skillName: state.name,
              operation: "remove",
              cause: error,
              retryable: false,
            }),
        ),
      );
    }

    return {
      skillName: state.name,
      removed: canonicalExists,
    };
  });

/**
 * Apply an Update change - replace skill with new version and re-sync agents.
 *
 * @param from - Current skill state
 * @param to - Target ideal skill
 * @param options - Apply options
 * @returns Effect yielding the apply result
 *
 * @experimental This API is unstable and may change without notice.
 */
export const applyUpdate = (
  _from: SkillState,
  to: IdealSkill,
  options: Pick<ApplyOptions, "axmDir" | "agents">,
): Effect.Effect<ApplySkillResult, ApplyError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const { axmDir } = options;

    const skillsDir = nodePath.join(axmDir, SKILLS_DIR);
    const canonicalPath = nodePath.join(skillsDir, to.name);

    // Remove old version
    const exists = yield* fs.exists(canonicalPath).pipe(Effect.orElse(() => Effect.succeed(false)));
    if (exists) {
      yield* fs.remove(canonicalPath, { recursive: true }).pipe(Effect.catchAll(() => Effect.void));
    }

    // Add new version (reuse applyAdd)
    return yield* applyAdd(to, options);
  });

/**
 * Apply the full diff - execute all changes with progress events.
 *
 * Phases:
 * 1. Apply skill file changes (add/remove/update)
 * 2. Update settings.json
 * 3. Update lockfile (last, as source of truth)
 *
 * @param diff - The diff to apply
 * @param options - Apply options
 * @returns Effect yielding the overall apply result
 *
 * @experimental This API is unstable and may change without notice.
 */
export const applyDiff = (
  diff: SkillsDiff,
  options: ApplyOptions,
): Effect.Effect<ApplyResult, ApplyError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const { axmDir, onProgress } = options;

    const changesToApply = getChangesToApply(diff);
    const emit = onProgress ?? (() => {});

    emit({ _tag: "ApplyStart", totalChanges: changesToApply.length });

    const applied: ApplySkillResult[] = [];
    const failed: ApplyFailure[] = [];

    // Phase 1: Apply skill file changes
    for (const [name, change] of changesToApply) {
      const action = changeToAction(change);
      emit({ _tag: "SkillStart", skillName: name, action });
      emit({ _tag: "SkillCopying", skillName: name });

      const result = yield* applyChange(change, options).pipe(Effect.either);

      if (result._tag === "Right") {
        applied.push(result.right);
        emit({ _tag: "SkillComplete", skillName: name, success: true });
      } else {
        failed.push({
          skillName: name,
          action,
          error: result.left,
        });
        emit({ _tag: "SkillComplete", skillName: name, success: false });
      }
    }

    // Phase 2: Update settings.json
    if (applied.length > 0) {
      emit({ _tag: "SettingsUpdating" });

      yield* updateSettingsForChanges(axmDir, changesToApply, applied).pipe(
        Effect.catchAll(() => Effect.void), // Continue on settings error
      );
    }

    // Phase 3: Update lockfile
    if (applied.length > 0) {
      emit({ _tag: "LockfileUpdating" });

      yield* updateLockfileForChanges(axmDir, changesToApply, applied).pipe(
        Effect.catchAll(() => Effect.void), // Continue on lockfile error
      );
    }

    emit({ _tag: "ApplyComplete", applied: applied.length, failed: failed.length });

    return { applied, failed };
  });

/**
 * Convert a SkillChange to its action type.
 */
const changeToAction = (change: SkillChange): ApplyAction => {
  switch (change._tag) {
    case "Add":
      return "add";
    case "Remove":
      return "remove";
    case "Update":
      return "update";
    case "Repair":
      return "repair";
    case "Unchanged":
      return "add"; // Should not happen, but provide default
  }
};

/**
 * Apply a single change.
 */
const applyChange = (
  change: SkillChange,
  options: Pick<ApplyOptions, "axmDir" | "agents">,
): Effect.Effect<ApplySkillResult, ApplyError, FileSystem.FileSystem> => {
  switch (change._tag) {
    case "Add":
      return applyAdd(change.skill, options);
    case "Remove":
      return applyRemove(change.skill, options).pipe(
        Effect.map((result) => ({
          skillName: result.skillName,
          canonicalPath: "",
          agentResults: [],
        })),
      );
    case "Update":
      return applyUpdate(change.from, change.to, options);
    case "Repair":
      return applyAdd(change.target, options);
    case "Unchanged":
      // Should not happen, but handle gracefully
      return Effect.succeed({
        skillName: change.skill.name,
        canonicalPath: "",
        agentResults: [],
      });
  }
};

/**
 * Update settings.json for applied changes.
 */
const updateSettingsForChanges = (
  axmDir: string,
  changes: readonly (readonly [string, SkillChange])[],
  applied: readonly ApplySkillResult[],
): Effect.Effect<void, ApplyError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const appliedNames = new Set(applied.map((r) => r.skillName));

    // Read current settings
    const settings = yield* readSettings(axmDir).pipe(
      Effect.catchTag("SettingsNotFoundError", () =>
        Effect.succeed({ agents: [], skills: {} as Record<string, string> }),
      ),
      Effect.mapError(
        (error) =>
          new ApplyError({
            message: "Failed to read settings",
            skillName: "",
            operation: "settings",
            cause: error,
            retryable: false,
          }),
      ),
    );

    // Build updated skills
    const updatedSkills = { ...settings.skills };

    for (const [name, change] of changes) {
      if (!appliedNames.has(name)) continue;

      switch (change._tag) {
        case "Add":
        case "Update":
        case "Repair": {
          const skill =
            change._tag === "Add"
              ? change.skill
              : change._tag === "Update"
                ? change.to
                : change.target;
          updatedSkills[name] = sourceToSettingsValue(skill.source);
          break;
        }
        case "Remove":
          delete updatedSkills[name];
          break;
      }
    }

    // Write updated settings
    yield* writeSettings(axmDir, { ...settings, skills: updatedSkills }).pipe(
      Effect.mapError(
        (error) =>
          new ApplyError({
            message: "Failed to write settings",
            skillName: "",
            operation: "settings",
            cause: error,
            retryable: false,
          }),
      ),
    );
  });

/**
 * Update lockfile for applied changes.
 */
const updateLockfileForChanges = (
  axmDir: string,
  changes: readonly (readonly [string, SkillChange])[],
  applied: readonly ApplySkillResult[],
): Effect.Effect<void, ApplyError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const appliedNames = new Set(applied.map((r) => r.skillName));

    // Read current lockfile
    const lockfile = yield* readLockfile(axmDir).pipe(
      Effect.mapError(
        (error) =>
          new ApplyError({
            message: "Failed to read lockfile",
            skillName: "",
            operation: "lockfile",
            cause: error,
            retryable: false,
          }),
      ),
    );

    // Build updated skills
    const updatedSkills = { ...lockfile.extensions.skills };

    for (const [name, change] of changes) {
      if (!appliedNames.has(name)) continue;

      switch (change._tag) {
        case "Add":
          updatedSkills[name] = idealToLockEntry(change.skill);
          break;
        case "Update":
          updatedSkills[name] = {
            ...idealToLockEntry(change.to),
            installedAt: lockfile.extensions.skills[name]?.installedAt ?? new Date().toISOString(),
          };
          break;
        case "Repair":
          updatedSkills[name] = {
            ...idealToLockEntry(change.target),
            installedAt: lockfile.extensions.skills[name]?.installedAt ?? new Date().toISOString(),
          };
          break;
        case "Remove":
          delete updatedSkills[name];
          break;
      }
    }

    // Write updated lockfile
    yield* writeLockfile(axmDir, {
      ...lockfile,
      extensions: {
        ...lockfile.extensions,
        skills: updatedSkills,
      },
    }).pipe(
      Effect.mapError(
        (error) =>
          new ApplyError({
            message: "Failed to write lockfile",
            skillName: "",
            operation: "lockfile",
            cause: error,
            retryable: false,
          }),
      ),
    );
  });
