/**
 * Apply logic for workspace skills reconciliation.
 *
 * Executes or displays a reconciliation plan based on the dryRun option.
 * Part of the desired-state reconciliation pattern.
 *
 * See docs/designs/dry-run.md for the reconciliation pattern.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as nodePath from "node:path";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Array from "effect/Array";
import * as Console from "effect/Console";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Either from "effect/Either";
import { pipe } from "effect/Function";
import * as Option from "effect/Option";
import * as Record from "effect/Record";
import type { AgentConfig } from "../agents/index.js";
import type { Lockfile, SkillLockEntry } from "../lockfile/index.js";
import { readLockfile, writeLockfile } from "../lockfile/index.js";
import type { Settings } from "../settings/index.js";
import { readSettings, writeSettings } from "../settings/index.js";
import { computeInstallPath } from "../extensions/skills/state/pure-functions.js";
import type {
  ApplyResult,
  Plan,
  PlanStep,
  SkillSourceV2,
} from "../extensions/skills/state/types.js";

// Re-export types for consumers
export type { ApplyResult, Plan, PlanStep } from "../extensions/skills/state/types.js";
export { PlanStep as PlanStepConstructor } from "../extensions/skills/state/types.js";

// =============================================================================
// Error Types
// =============================================================================

/**
 * Error during plan application.
 *
 * This is the Effect-style error class used in applyPlan.
 * Wraps the ApplyError interface from types.ts.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class ApplyError extends Data.TaggedError("ApplyError")<{
  readonly message: string;
  readonly step: Option.Option<PlanStep>;
  readonly cause: Option.Option<unknown>;
}> {}

// =============================================================================
// Apply Options
// =============================================================================

/**
 * Options for applyPlan.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ApplyOptions {
  /** If true, display plan only without executing */
  readonly dryRun: boolean;
  /** Optional progress callback - UI rendering is handler responsibility */
  readonly onProgress?: (step: PlanStep, status: "starting" | "completed") => void;
}

// =============================================================================
// Dependencies
// =============================================================================

/**
 * Dependencies for applyPlan.
 * Allows injection of step execution and state updates for testing.
 *
 * The R type parameter represents the context requirements for the deps.
 * For real usage, this will typically be FileSystem.FileSystem.
 * For testing, this can be never (no requirements with mocks).
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ApplyDeps<R = never> {
  /** Execute a single step */
  readonly applyStep: (step: PlanStep) => Effect.Effect<void, ApplyError, R>;
  /** Update lockfile after successful apply */
  readonly updateLockfile: (plan: Plan) => Effect.Effect<void, ApplyError, R>;
  /** Update settings after successful apply */
  readonly updateSettings: (plan: Plan) => Effect.Effect<void, ApplyError, R>;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create an empty ApplyResult (for dry-run mode).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const emptyApplyResult = (): ApplyResult => ({
  applied: [],
  failed: [],
  summary: {
    installed: 0,
    updated: 0,
    uninstalled: 0,
    failed: 0,
  },
});

/**
 * Build ApplyResult from execution results.
 */
const buildApplyResult = (
  results: ReadonlyArray<{ step: PlanStep; error?: ApplyError }>,
): ApplyResult => {
  const applied: PlanStep[] = [];
  const failed: Array<{ step: PlanStep; error: ApplyError }> = [];

  let installed = 0;
  let updated = 0;
  let uninstalled = 0;

  for (const result of results) {
    if (result.error) {
      failed.push({ step: result.step, error: result.error });
    } else {
      applied.push(result.step);
      switch (result.step._tag) {
        case "InstallSkill":
          installed++;
          break;
        case "UpdateSkill":
          updated++;
          break;
        case "UninstallSkill":
          uninstalled++;
          break;
      }
    }
  }

  return {
    applied,
    failed,
    summary: {
      installed,
      updated,
      uninstalled,
      failed: failed.length,
    },
  };
};

// =============================================================================
// Display Functions
// =============================================================================

/**
 * Format agents for display.
 */
const formatAgents = (agents: ReadonlyArray<string>): string =>
  agents.length > 0 ? ` @ ${agents.join(", ")}` : "";

/**
 * Format version for display.
 */
const formatVersion = (version: Option.Option<string>): string =>
  pipe(
    version,
    Option.map((v) => ` (${v})`),
    Option.getOrElse(() => ""),
  );

/**
 * Format a single step for display.
 */
const formatStep = (step: PlanStep): string => {
  switch (step._tag) {
    case "InstallSkill":
      return `  (install) ${step.skill}${formatVersion(step.version)}${formatAgents(step.agents)}`;
    case "UpdateSkill": {
      const from = pipe(
        step.fromVersion,
        Option.getOrElse(() => "unknown"),
      );
      const to = pipe(
        step.toVersion,
        Option.getOrElse(() => "latest"),
      );
      return `  (update) ${step.skill} ${from} -> ${to}${formatAgents(step.agents)}`;
    }
    case "UninstallSkill":
      return `  (uninstall) ${step.skill}${formatAgents(step.agents)}`;
  }
};

/**
 * Format summary for display.
 */
const formatSummary = (plan: Plan): string => {
  const counts = {
    install: 0,
    update: 0,
    uninstall: 0,
  };

  for (const step of plan.steps) {
    switch (step._tag) {
      case "InstallSkill":
        counts.install++;
        break;
      case "UpdateSkill":
        counts.update++;
        break;
      case "UninstallSkill":
        counts.uninstall++;
        break;
    }
  }

  const parts: string[] = [];
  if (counts.install > 0) {
    parts.push(`${counts.install} skill${counts.install === 1 ? "" : "s"} to install`);
  }
  if (counts.update > 0) {
    parts.push(`${counts.update} skill${counts.update === 1 ? "" : "s"} to update`);
  }
  if (counts.uninstall > 0) {
    parts.push(`${counts.uninstall} skill${counts.uninstall === 1 ? "" : "s"} to uninstall`);
  }

  return parts.length > 0 ? `\n  ${parts.join(", ")}` : "";
};

/**
 * Display a plan (for dry-run mode).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const displayPlan = (plan: Plan): Effect.Effect<void> =>
  Effect.gen(function* () {
    if (plan.steps.length === 0) {
      yield* Console.log("No changes to apply.");
      return;
    }

    for (const step of plan.steps) {
      yield* Console.log(formatStep(step));
    }

    yield* Console.log(formatSummary(plan));
  });

// =============================================================================
// Main Apply Function
// =============================================================================

/**
 * Apply a plan - display if dryRun, execute otherwise.
 *
 * Key behaviors:
 * - dryRun: true -> Display plan, no side effects
 * - dryRun: false -> Execute steps sequentially
 * - Stop on first failure
 * - Only update lockfile/settings on full success
 * - Progress callback for UI updates
 *
 * @param plan - The execution plan
 * @param opts - Apply options (dryRun, onProgress)
 * @param deps - Dependencies for step execution and state updates
 * @returns Effect yielding ApplyResult
 *
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import { applyPlan, type ApplyDeps } from "./workspace/apply";
 *
 * const plan = { steps: [...] };
 *
 * // Dry-run mode - displays plan without executing
 * const dryRunResult = yield* applyPlan(plan, { dryRun: true }, deps);
 *
 * // Apply mode - executes plan
 * const result = yield* applyPlan(plan, {
 *   dryRun: false,
 *   onProgress: (step, status) => console.log(`${step.skill}: ${status}`)
 * }, deps);
 * ```
 *
 * @experimental This API is unstable and may change without notice.
 */
export const applyPlan = <R>(
  plan: Plan,
  opts: ApplyOptions,
  deps: ApplyDeps<R>,
): Effect.Effect<ApplyResult, ApplyError, R> =>
  Effect.gen(function* () {
    if (opts.dryRun) {
      yield* displayPlan(plan);
      return emptyApplyResult();
    }

    const results: Array<{ step: PlanStep; error?: ApplyError }> = [];

    // Execute steps sequentially, stop on first failure
    for (const step of plan.steps) {
      opts.onProgress?.(step, "starting");
      const result = yield* deps.applyStep(step).pipe(Effect.either);

      if (Either.isLeft(result)) {
        results.push({ step, error: result.left });
        break; // Stop on first failure
      }

      results.push({ step });
      opts.onProgress?.(step, "completed");
    }

    // Only update lockfile/settings if all steps succeeded
    const allSucceeded = results.every((r) => !r.error);
    if (allSucceeded && plan.steps.length > 0) {
      yield* deps.updateLockfile(plan);
      yield* deps.updateSettings(plan);
    }

    return buildApplyResult(results);
  });

// =============================================================================
// Apply Step Options
// =============================================================================

/**
 * Options for applyStep.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ApplyStepOptions {
  /** Workspace root path (e.g., .axm/) */
  readonly workspacePath: string;
  /** Available agents for syncing */
  readonly agents: readonly AgentConfig[];
}

// =============================================================================
// Internal Helpers for Step Execution
// =============================================================================

/**
 * Get source path from a SkillSourceV2.
 * For Local sources, returns the path directly.
 * For other sources, they should have been fetched to a local path first.
 * @throws Error if source is a remote type that hasn't been fetched.
 */
const getSourcePathOrThrow = (source: SkillSourceV2): string => {
  switch (source._tag) {
    case "Local":
      return source.path;
    case "GitHub":
    case "Registry":
      // Remote sources should be fetched to a local cache before apply
      // This is a programming error - caller should fetch first
      throw new Error(`Source type ${source._tag} must be fetched to local path before apply`);
  }
};

/**
 * Copy a directory recursively.
 */
const copyDirectory = (
  srcDir: string,
  destDir: string,
  _skillName: string,
): Effect.Effect<void, ApplyError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    // Ensure destination exists
    yield* fs.makeDirectory(destDir, { recursive: true }).pipe(
      Effect.mapError(
        (error) =>
          new ApplyError({
            message: `Failed to create directory: ${destDir}`,
            step: Option.none(),
            cause: Option.some(error),
          }),
      ),
    );

    // Read source directory entries
    const entries = yield* fs.readDirectory(srcDir).pipe(
      Effect.mapError(
        (error) =>
          new ApplyError({
            message: `Failed to read directory: ${srcDir}`,
            step: Option.none(),
            cause: Option.some(error),
          }),
      ),
    );

    // Process each entry concurrently
    yield* Effect.forEach(
      entries,
      (entry) =>
        Effect.gen(function* () {
          const srcPath = nodePath.join(srcDir, entry);
          const destPath = nodePath.join(destDir, entry);

          const stat = yield* fs.stat(srcPath).pipe(
            Effect.mapError(
              (error) =>
                new ApplyError({
                  message: `Failed to stat: ${srcPath}`,
                  step: Option.none(),
                  cause: Option.some(error),
                }),
            ),
          );

          if (stat.type === "Directory") {
            yield* copyDirectory(srcPath, destPath, _skillName);
          } else {
            yield* fs.copyFile(srcPath, destPath).pipe(
              Effect.mapError(
                (error) =>
                  new ApplyError({
                    message: `Failed to copy file: ${srcPath} -> ${destPath}`,
                    step: Option.none(),
                    cause: Option.some(error),
                  }),
              ),
            );
          }
        }),
      { concurrency: "unbounded" },
    );
  });

/**
 * Get the canonical install path for a skill in the workspace.
 */
const getCanonicalPath = (
  workspacePath: string,
  source: SkillSourceV2,
  skillName: string,
): string => {
  // computeInstallPath returns relative path like ".axm/extensions/..."
  // We need to replace the ".axm" prefix with our workspace path
  const relativePath = computeInstallPath(source, skillName);
  // Remove the ".axm/" prefix and join with workspace path
  const pathWithoutAxm = relativePath.replace(/^\.axm\//, "");
  return nodePath.join(workspacePath, pathWithoutAxm);
};

/**
 * Get the external skills path for uninstall (when we don't have source info).
 */
const getExternalSkillPath = (workspacePath: string, skillName: string): string =>
  nodePath.join(workspacePath, "extensions", "external", "skills", skillName);

/**
 * Sync skill to agent directories.
 * Creates symlinks on Unix, copies on Windows (if symlink fails).
 */
const syncToAgents = (
  canonicalPath: string,
  skillName: string,
  agentIds: readonly string[],
  availableAgents: readonly AgentConfig[],
): Effect.Effect<void, ApplyError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    yield* Effect.forEach(
      agentIds,
      (agentId) =>
        Effect.gen(function* () {
          const maybeAgent = Array.findFirst(availableAgents, (a) => a.id === agentId);
          if (Option.isNone(maybeAgent)) return;
          const agent = maybeAgent.value;

          const agentSkillsDir = agent.skills.dir;
          const agentSkillPath = nodePath.join(agentSkillsDir, skillName);

          // Ensure agent skills directory exists
          yield* fs.makeDirectory(agentSkillsDir, { recursive: true }).pipe(
            Effect.mapError(
              (error) =>
                new ApplyError({
                  message: `Failed to create agent skills directory: ${agentSkillsDir}`,
                  step: Option.none(),
                  cause: Option.some(error),
                }),
            ),
          );

          // Remove existing if present
          const exists = yield* fs
            .exists(agentSkillPath)
            .pipe(Effect.orElse(() => Effect.succeed(false)));
          if (exists) {
            yield* fs
              .remove(agentSkillPath, { recursive: true })
              .pipe(Effect.catchAll(() => Effect.void));
          }

          // Calculate relative path from agent skills dir to canonical path
          const relativeTarget = nodePath.relative(agentSkillsDir, canonicalPath);

          // Try symlink first, fall back to copy
          yield* fs.symlink(relativeTarget, agentSkillPath).pipe(
            Effect.catchAll(() =>
              // Symlink failed (e.g., Windows without admin), fall back to copy
              copyDirectory(canonicalPath, agentSkillPath, skillName),
            ),
          );
        }),
      { concurrency: "unbounded", discard: true },
    );
  });

/**
 * Remove skill from agent directories.
 */
const removeFromAgents = (
  skillName: string,
  agentIds: readonly string[],
  availableAgents: readonly AgentConfig[],
): Effect.Effect<void, ApplyError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    yield* Effect.forEach(
      agentIds,
      (agentId) =>
        Effect.gen(function* () {
          const maybeAgent = Array.findFirst(availableAgents, (a) => a.id === agentId);
          if (Option.isNone(maybeAgent)) return;
          const agent = maybeAgent.value;

          const agentSkillPath = nodePath.join(agent.skills.dir, skillName);

          const exists = yield* fs
            .exists(agentSkillPath)
            .pipe(Effect.orElse(() => Effect.succeed(false)));
          if (exists) {
            yield* fs
              .remove(agentSkillPath, { recursive: true })
              .pipe(Effect.catchAll(() => Effect.void));
          }
        }),
      { concurrency: "unbounded", discard: true },
    );
  });

// =============================================================================
// Step Implementations
// =============================================================================

/**
 * Install a skill to canonical location + sync to agents.
 *
 * @experimental This API is unstable and may change without notice.
 */
const installSkill = (
  step: PlanStep & { _tag: "InstallSkill" },
  options: ApplyStepOptions,
): Effect.Effect<void, ApplyError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const { workspacePath, agents } = options;

    const sourcePath = getSourcePathOrThrow(step.source);
    const canonicalPath = getCanonicalPath(workspacePath, step.source, step.skill);

    // Check if source exists
    const sourceExists = yield* fs.exists(sourcePath).pipe(
      Effect.mapError(
        (error) =>
          new ApplyError({
            message: `Failed to check source: ${sourcePath}`,
            step: Option.some(step),
            cause: Option.some(error),
          }),
      ),
    );

    if (!sourceExists) {
      return yield* new ApplyError({
        message: `Source directory does not exist: ${sourcePath}`,
        step: Option.some(step),
        cause: Option.none(),
      });
    }

    // Copy to canonical location
    yield* copyDirectory(sourcePath, canonicalPath, step.skill).pipe(
      Effect.mapError(
        (error) =>
          new ApplyError({
            message: `Failed to install skill to canonical location: ${canonicalPath}`,
            step: Option.some(step),
            cause: Option.some(error),
          }),
      ),
    );

    // Sync to agents
    yield* syncToAgents(canonicalPath, step.skill, step.agents, agents);
  });

/**
 * Update = delete existing + install new.
 *
 * @experimental This API is unstable and may change without notice.
 */
const updateSkill = (
  step: PlanStep & { _tag: "UpdateSkill" },
  options: ApplyStepOptions,
): Effect.Effect<void, ApplyError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const { workspacePath } = options;

    const canonicalPath = getCanonicalPath(workspacePath, step.source, step.skill);

    // Remove existing canonical version
    const exists = yield* fs.exists(canonicalPath).pipe(Effect.orElse(() => Effect.succeed(false)));
    if (exists) {
      yield* fs.remove(canonicalPath, { recursive: true }).pipe(
        Effect.mapError(
          (error) =>
            new ApplyError({
              message: `Failed to remove existing skill: ${canonicalPath}`,
              step: Option.some(step),
              cause: Option.some(error),
            }),
        ),
      );
    }

    // Install new version (reuse installSkill logic)
    const installStep: PlanStep & { _tag: "InstallSkill" } = {
      _tag: "InstallSkill",
      skill: step.skill,
      source: step.source,
      version: step.toVersion,
      gitTreeHash: step.toHash,
      agents: step.agents,
    };

    yield* installSkill(installStep, options);
  });

/**
 * Remove from canonical location + agents.
 *
 * @experimental This API is unstable and may change without notice.
 */
const uninstallSkill = (
  step: PlanStep & { _tag: "UninstallSkill" },
  options: ApplyStepOptions,
): Effect.Effect<void, ApplyError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const { workspacePath, agents } = options;

    // For uninstall, we don't have source info, so use external path
    // In the future, we may need to look up the lockfile to find the actual path
    const canonicalPath = getExternalSkillPath(workspacePath, step.skill);

    // Remove from agents first
    yield* removeFromAgents(step.skill, step.agents, agents);

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
              step: Option.some(step),
              cause: Option.some(error),
            }),
        ),
      );
    }
  });

// =============================================================================
// Apply Step - Main Entry Point
// =============================================================================

/**
 * Apply a single plan step.
 *
 * Routes to step-specific implementation based on step type:
 * - InstallSkill: Copy source to canonical location, sync to agents
 * - UpdateSkill: Delete existing + install new version
 * - UninstallSkill: Remove from canonical location and agent directories
 *
 * @param step - The plan step to execute
 * @param options - Apply options including workspace path and available agents
 * @returns Effect that completes when step is applied
 *
 * @example
 * ```typescript
 * import { Effect, Option } from "effect";
 * import { applyStep } from "./workspace/apply";
 *
 * const step = {
 *   _tag: "InstallSkill" as const,
 *   skill: "my-skill",
 *   source: { _tag: "Local" as const, path: "/path/to/skill" },
 *   version: Option.none(),
 *   gitTreeHash: Option.some("abc123"),
 *   agents: ["claude-code"],
 * };
 *
 * const program = applyStep(step, {
 *   workspacePath: "/path/to/.axm",
 *   agents: [{ id: "claude-code", name: "Claude Code", detectPath: "~/.claude", skillsDir: "~/.claude/commands" }],
 * });
 * ```
 *
 * @experimental This API is unstable and may change without notice.
 */
export const applyStep = (
  step: PlanStep,
  options: ApplyStepOptions,
): Effect.Effect<void, ApplyError, FileSystem.FileSystem> => {
  switch (step._tag) {
    case "InstallSkill":
      return installSkill(step, options);
    case "UpdateSkill":
      return updateSkill(step, options);
    case "UninstallSkill":
      return uninstallSkill(step, options);
  }
};

// =============================================================================
// Lockfile and Settings Update Functions
// =============================================================================

/**
 * Convert SkillSourceV2 to a lockfile entry.
 *
 * @experimental This API is unstable and may change without notice.
 */
const sourceV2ToLockEntry = (
  source: SkillSourceV2,
  _version: Option.Option<string>,
  gitTreeHash: Option.Option<string>,
  agents: ReadonlyArray<string>,
  installedAt: Date,
): SkillLockEntry => {
  const now = new Date();
  const hash = Option.getOrUndefined(gitTreeHash);

  switch (source._tag) {
    case "Local":
      return {
        source: "local" as const,
        path: source.path,
        agents: [...agents],
        installedAt,
        updatedAt: now,
        ...(hash && { gitTreeHash: hash }),
      };
    case "GitHub":
      return {
        source: "github" as const,
        owner: source.owner,
        repo: source.repo,
        ...(Option.isSome(source.ref) && { ref: source.ref.value }),
        ...(Option.isSome(source.path) && { path: source.path.value }),
        agents: [...agents],
        installedAt,
        updatedAt: now,
        ...(hash && { gitTreeHash: hash }),
      };
    case "Registry":
      return {
        source: "registry" as const,
        scope: source.scope,
        name: source.name,
        ...(Option.isSome(source.version) && { version: source.version.value }),
        agents: [...agents],
        installedAt,
        updatedAt: now,
        ...(hash && { gitTreeHash: hash }),
      };
  }
};

/**
 * Convert SkillSourceV2 to a settings value string.
 *
 * Formats:
 * - Local: `local:/path/to/skill`
 * - GitHub: `github:owner/repo[/path][#ref]`
 * - Registry: `@scope/name[@version]`
 *
 * @experimental This API is unstable and may change without notice.
 */
const sourceV2ToSettingsValue = (source: SkillSourceV2): string => {
  switch (source._tag) {
    case "Local":
      return `local:${source.path}`;
    case "GitHub": {
      let value = `github:${source.owner}/${source.repo}`;
      if (Option.isSome(source.path)) {
        value += `/${source.path.value}`;
      }
      if (Option.isSome(source.ref)) {
        value += `#${source.ref.value}`;
      }
      return value;
    }
    case "Registry": {
      let value = `@${source.scope}/${source.name}`;
      if (Option.isSome(source.version)) {
        value += `@${source.version.value}`;
      }
      return value;
    }
  }
};

/**
 * Update the lockfile based on a plan.
 *
 * Processes each step in the plan and updates the lockfile accordingly:
 * - InstallSkill: Adds a new entry
 * - UpdateSkill: Updates an existing entry (preserves installedAt)
 * - UninstallSkill: Removes the entry
 *
 * @param axmDir - Path to the .axm directory
 * @param plan - The execution plan
 * @returns Effect that completes when lockfile is updated
 *
 * @experimental This API is unstable and may change without notice.
 */
export const updateLockfileForPlan = (
  axmDir: string,
  plan: Plan,
): Effect.Effect<void, ApplyError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    // Read current lockfile (creates empty one if not exists)
    const lockfile = yield* readLockfile(axmDir).pipe(
      Effect.mapError(
        (error) =>
          new ApplyError({
            message: `Failed to read lockfile: ${error.message}`,
            step: Option.none(),
            cause: Option.some(error),
          }),
      ),
    );

    // Build updated skills map
    const updatedSkills: Record<string, SkillLockEntry> = { ...lockfile.skills };
    const now = new Date();

    for (const step of plan.steps) {
      switch (step._tag) {
        case "InstallSkill": {
          const entry = sourceV2ToLockEntry(
            step.source,
            step.version,
            step.gitTreeHash,
            step.agents,
            now,
          );
          updatedSkills[step.skill] = entry;
          break;
        }
        case "UpdateSkill": {
          // Preserve original installedAt if exists
          const existingEntry = lockfile.skills[step.skill];
          const installedAt = existingEntry?.installedAt ?? now;
          const entry = sourceV2ToLockEntry(
            step.source,
            step.toVersion,
            step.toHash,
            step.agents,
            installedAt,
          );
          updatedSkills[step.skill] = entry;
          break;
        }
        case "UninstallSkill":
          delete updatedSkills[step.skill];
          break;
      }
    }

    // Write updated lockfile
    const updatedLockfile: Lockfile = {
      ...lockfile,
      skills: updatedSkills,
    };

    yield* writeLockfile(axmDir, updatedLockfile).pipe(
      Effect.mapError(
        (error) =>
          new ApplyError({
            message: `Failed to write lockfile: ${error.message}`,
            step: Option.none(),
            cause: Option.some(error),
          }),
      ),
    );
  });

/**
 * Update the settings based on a plan.
 *
 * Processes each step in the plan and updates the settings accordingly:
 * - InstallSkill: Adds/updates the skill entry
 * - UpdateSkill: Updates the skill entry
 * - UninstallSkill: Removes the skill entry
 *
 * @param axmDir - Path to the .axm directory
 * @param plan - The execution plan
 * @returns Effect that completes when settings are updated
 *
 * @experimental This API is unstable and may change without notice.
 */
export const updateSettingsForPlan = (
  axmDir: string,
  plan: Plan,
): Effect.Effect<void, ApplyError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    // Read current settings (use empty if not exists)
    const settings = yield* readSettings(axmDir).pipe(
      Effect.catchTag("SettingsNotFoundError", () => Effect.succeed<Settings>({})),
      Effect.mapError(
        (error) =>
          new ApplyError({
            message: `Failed to read settings: ${(error as { message: string }).message}`,
            step: Option.none(),
            cause: Option.some(error),
          }),
      ),
    );

    // Build updated skills map
    const updatedSkills: Record<string, string> = { ...(settings.skills ?? {}) };

    for (const step of plan.steps) {
      switch (step._tag) {
        case "InstallSkill":
          updatedSkills[step.skill] = sourceV2ToSettingsValue(step.source);
          break;
        case "UpdateSkill":
          updatedSkills[step.skill] = sourceV2ToSettingsValue(step.source);
          break;
        case "UninstallSkill":
          delete updatedSkills[step.skill];
          break;
      }
    }

    // Write updated settings
    yield* writeSettings(axmDir, { ...settings, skills: updatedSkills }).pipe(
      Effect.mapError(
        (error) =>
          new ApplyError({
            message: `Failed to write settings: ${error.message}`,
            step: Option.none(),
            cause: Option.some(error),
          }),
      ),
    );
  });
