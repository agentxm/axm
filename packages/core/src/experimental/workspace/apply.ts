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
import { FileSystem } from "@effect/platform";
import { Console, Data, Effect, Either, Option, pipe } from "effect";
import { computeInstallPath } from "../skills/state/pure-functions.js";
import type { ApplyResult, Plan, PlanStep, SkillSourceV2 } from "../skills/state/types.js";
import type { AgentConfig } from "../skills/types.js";
import type { WorkspaceContext } from "./context.js";

// Re-export types for consumers
export type { ApplyResult, Plan, PlanStep } from "../skills/state/types.js";
export { PlanStep as PlanStepConstructor } from "../skills/state/types.js";

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
 * @experimental This API is unstable and may change without notice.
 */
export interface ApplyDeps {
  /** Execute a single step */
  readonly applyStep: (step: PlanStep) => Effect.Effect<void, ApplyError>;
  /** Update lockfile after successful apply */
  readonly updateLockfile: (plan: Plan) => Effect.Effect<void, ApplyError>;
  /** Update settings after successful apply */
  readonly updateSettings: (plan: Plan) => Effect.Effect<void, ApplyError>;
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
 * @param _ws - Workspace context (used for path resolution)
 * @param plan - The execution plan
 * @param opts - Apply options (dryRun, onProgress)
 * @param deps - Dependencies for step execution and state updates
 * @returns Effect yielding ApplyResult
 *
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import { applyPlan, type ApplyDeps } from "@agentxm/core/experimental/workspace/apply";
 * import { makeWorkspaceContext } from "@agentxm/core/experimental/workspace/context";
 *
 * const ws = makeWorkspaceContext({ global: false, interactive: true });
 * const plan = { steps: [...] };
 *
 * // Dry-run mode - displays plan without executing
 * const dryRunResult = yield* applyPlan(ws, plan, { dryRun: true }, deps);
 *
 * // Apply mode - executes plan
 * const result = yield* applyPlan(ws, plan, {
 *   dryRun: false,
 *   onProgress: (step, status) => console.log(`${step.skill}: ${status}`)
 * }, deps);
 * ```
 *
 * @experimental This API is unstable and may change without notice.
 */
export const applyPlan = (
  _ws: WorkspaceContext,
  plan: Plan,
  opts: ApplyOptions,
  deps: ApplyDeps,
): Effect.Effect<ApplyResult, ApplyError> =>
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
 */
const getSourcePath = (source: SkillSourceV2): string => {
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

    // Process each entry
    for (const entry of entries) {
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
    }
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

    for (const agentId of agentIds) {
      const agent = availableAgents.find((a) => a.id === agentId);
      if (!agent || !agent.skillsDir) continue;

      const agentSkillsDir = agent.skillsDir;
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
    }
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

    for (const agentId of agentIds) {
      const agent = availableAgents.find((a) => a.id === agentId);
      if (!agent || !agent.skillsDir) continue;

      const agentSkillPath = nodePath.join(agent.skillsDir, skillName);

      const exists = yield* fs
        .exists(agentSkillPath)
        .pipe(Effect.orElse(() => Effect.succeed(false)));
      if (exists) {
        yield* fs
          .remove(agentSkillPath, { recursive: true })
          .pipe(Effect.catchAll(() => Effect.void));
      }
    }
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

    const sourcePath = getSourcePath(step.source);
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
 * import { applyStep } from "@agentxm/core/experimental/workspace/apply";
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
