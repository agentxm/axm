/**
 * Skills state module - state-based architecture for dry-run and validation.
 *
 * This module provides an Arborist-style state model:
 * - **Actual state** - What exists on disk (.axm/skills/)
 * - **Locked state** - What the lockfile says should exist (axm-lock.yaml)
 * - **Ideal state** - Desired state after an operation
 * - **Diff/Plan** - Changes to transform actual to ideal
 *
 * @example
 * ```typescript
 * import {
 *   loadSkillsState,
 *   buildIdealForInstall,
 *   computeDiff,
 *   hasChanges,
 * } from "@agentxm/core/experimental/skills/state";
 *
 * const program = Effect.gen(function* () {
 *   // Load current state
 *   const current = yield* loadSkillsState(axmDir);
 *
 *   // Build ideal state for install
 *   const ideal = yield* buildIdealForInstall(current, source, options);
 *
 *   // Compute diff (the plan)
 *   const diff = computeDiff(current, ideal);
 *
 *   // Check if there are changes
 *   if (!hasChanges(diff)) {
 *     console.log("Already up to date");
 *     return;
 *   }
 *
 *   // Display plan (for dry-run) or apply changes
 *   displayDiff(diff);
 * });
 * ```
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Apply logic
export type {
  AgentInstallResult,
  ApplyAction,
  ApplyFailure,
  ApplyOptions,
  ApplyProgressEvent,
  ApplyResult,
  ApplySkillResult,
  RemoveSkillResult,
} from "./apply.js";
export { ApplyError, applyAdd, applyDiff, applyRemove, applyUpdate } from "./apply.js";
// Diff computation
export { computeDiff, getChangesToApply, hasChanges } from "./diff.js";
// Ideal state builders
export type { InstallOptions, ResolvedSource } from "./ideal.js";
export {
  BuildIdealError,
  buildIdealForInstall,
  buildIdealForSync,
  buildIdealForUninstall,
} from "./ideal.js";
// Loading
export {
  computeValidity,
  LoadError,
  loadActualSkills,
  loadLockedSkills,
  loadSkillsState,
} from "./load.js";
// Types
export type {
  ActualSkill,
  DiffSummary,
  IdealSkill,
  IdealSkillsState,
  LockedSkill,
  SkillChange,
  SkillChangeWithName,
  SkillFrontmatter,
  SkillSource,
  SkillState,
  SkillsDiff,
  SkillsDiffJson,
  SkillsState,
  SkillValidity,
  SkillValidityCode,
  ValiditySeverity,
} from "./types.js";
// Type constructors and utilities
// Schemas (for JSON serialization)
export {
  ActualSkillSchema,
  DiffSummarySchema,
  getValidityCode,
  IdealSkillSchema,
  IdealSkillsStateSchema,
  LockedSkillSchema,
  SkillChange as SkillChangeConstructors,
  SkillChangeSchema,
  SkillFrontmatterSchema,
  SkillSource as SkillSourceConstructors,
  SkillSourceSchema,
  SkillStateSchema,
  SkillsDiffSchema,
  SkillsStateSchema,
  SkillValidity as SkillValidityConstructors,
  SkillValiditySchema,
  severityFromCode,
  skillsDiffToJson,
} from "./types.js";
