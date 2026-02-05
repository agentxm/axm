/**
 * Skills state types module - V2 types for workspace-based architecture.
 *
 * This module provides types for the state-based reconciliation model:
 * - **Actual state** - What exists on disk (.axm/skills/)
 * - **Locked state** - What the lockfile says should exist (axm-lock.yaml)
 * - **Ideal state** - Desired state after an operation
 * - **Plan** - Changes to transform actual to ideal
 *
 * For the implementation, use the workspace module:
 * @see {@link ../workspace/index.js}
 *
 * @example
 * ```typescript
 * import {
 *   loadCurrentState,
 *   buildIdealForInstall,
 *   buildPlan,
 *   planHasChanges,
 *   applyPlan,
 * } from "../workspace/index.js";
 *
 * const program = Effect.gen(function* () {
 *   // Load current state
 *   const current = yield* loadCurrentState(axmDir);
 *
 *   // Build ideal state for install
 *   const ideal = yield* buildIdealForInstall(current, source, options);
 *
 *   // Build plan
 *   const plan = buildPlan(current, ideal);
 *
 *   // Check if there are changes
 *   if (!planHasChanges(plan)) {
 *     console.log("Already up to date");
 *     return;
 *   }
 *
 *   // Apply plan
 *   yield* applyPlan(plan);
 * });
 * ```
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

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
