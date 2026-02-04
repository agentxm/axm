/**
 * Skills state module - state-based architecture for dry-run and validation.
 *
 * This module provides an Arborist-style state model:
 * - **Actual state** - What exists on disk (.axm/skills/)
 * - **Locked state** - What the lockfile says should exist (axm-lock.yaml)
 * - **Ideal state** - Desired state after an operation
 * - **Diff/Plan** - Changes to transform actual to ideal
 *
 * See docs/designs/dry-run.md for the reconciliation pattern.
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
export type {
  FetchLatestVersion,
  InstallOptions,
  LatestVersionResult,
  ResolvedSource,
  SkillsUpdateCommand,
  UninstallOptionsV2,
} from "./ideal.js";
export {
  BuildIdealError,
  buildIdealForInstall,
  buildIdealForSync,
  buildIdealForUninstall,
  buildIdealForUninstallV2,
  buildIdealForUpdate,
  CommandError,
} from "./ideal.js";

// Loading
export {
  computeValidity,
  LoadError,
  loadActualSkills,
  loadLockedSkills,
  loadSkillsState,
} from "./load.js";

// =============================================================================
// Types
// =============================================================================

// Legacy types (still used by existing code)
// New reconciliation types (see docs/designs/dry-run.md)
export type {
  ActualSkill,
  ActualSkillIssue,
  AnyIssue,
  CurrentState,
  DiffSummary,
  IdealSkillLegacy,
  IdealSkillsState,
  IdealSkillType as IdealSkill,
  IdealSkillV2,
  IdealState,
  LockedSkill,
  LockedSkillV2,
  RegistryLocation,
  Severity,
  SkillChange,
  SkillChangeWithName,
  SkillFrontmatter,
  SkillSource,
  SkillSourceV2,
  SkillState,
  SkillStateIssue,
  SkillStateV2,
  SkillsDiff,
  SkillsDiffJson,
  SkillsState,
  SkillValidity,
  SkillValidityCode,
  ValiditySeverity,
  WorkspaceIssue,
} from "./types.js";

// =============================================================================
// Schemas and Constructors
// =============================================================================

// Legacy schemas and constructors
// New reconciliation constructors and schemas
// Backwards compatibility: IdealSkill constructor alias for IdealSkillV2
export {
  ActualSkillIssue as ActualSkillIssueConstructors,
  ActualSkillIssueSchema,
  ActualSkillSchema,
  AnyIssueSchema,
  CurrentStateSchema,
  DiffSummarySchema,
  getValidityCode,
  IdealSkill as IdealSkillConstructors,
  IdealSkillLegacySchema,
  IdealSkillsStateSchema,
  IdealSkillV2 as IdealSkillV2Constructors,
  IdealSkillV2Schema,
  IdealStateV2Schema,
  LockedSkillSchema,
  LockedSkillV2Schema,
  RegistryLocation as RegistryLocationConstructors,
  RegistryLocationSchema,
  SeveritySchema,
  SkillChange as SkillChangeConstructors,
  SkillChangeSchema,
  SkillFrontmatterSchema,
  SkillSource as SkillSourceConstructors,
  SkillSourceSchema,
  SkillSourceV2 as SkillSourceV2Constructors,
  SkillSourceV2Schema,
  SkillStateIssue as SkillStateIssueConstructors,
  SkillStateIssueSchema,
  SkillStateSchema,
  SkillStateV2Schema,
  SkillsDiffSchema,
  SkillsStateSchema,
  SkillValidity as SkillValidityConstructors,
  SkillValiditySchema,
  severityFromCode,
  skillsDiffToJson,
  WorkspaceIssue as WorkspaceIssueConstructors,
  WorkspaceIssueSchema,
} from "./types.js";
