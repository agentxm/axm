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
// New reconciliation types (see openspec/specs/plan-confirm-apply/spec.md)
export type {
  ActualSkill,
  AnyIssue,
  CurrentState,
  DiffSummary,
  IdealSkillLegacy,
  IdealSkillsState,
  IdealState,
  LockedSkill,
  LockedSkillV2,
  Severity,
  SkillChangeWithName,
  SkillFrontmatter,
  SkillState,
  SkillStateV2,
  SkillsDiff,
  SkillsDiffJson,
  SkillsState,
  SkillValidityCode,
  ValiditySeverity,
} from "./types.js";

// =============================================================================
// Schemas and Constructors
// =============================================================================

// Legacy schemas and constructors
// New reconciliation constructors and schemas
// Backwards compatibility: IdealSkill constructor alias for IdealSkillV2
export {
  ActualSkillIssue,
  ActualSkillIssueSchema,
  ActualSkillSchema,
  AnyIssueSchema,
  CurrentStateSchema,
  DiffSummarySchema,
  getValidityCode,
  IdealSkill,
  IdealSkillLegacySchema,
  IdealSkillsStateSchema,
  IdealSkillV2,
  IdealSkillV2Schema,
  IdealStateV2Schema,
  LockedSkillSchema,
  LockedSkillV2Schema,
  SeveritySchema,
  SkillChange,
  SkillChangeSchema,
  SkillFrontmatterSchema,
  SkillSource,
  SkillSourceSchema,
  SkillStateIssue,
  SkillStateIssueSchema,
  SkillStateSchema,
  SkillStateV2Schema,
  SkillsDiffSchema,
  SkillsStateSchema,
  SkillValidity,
  SkillValiditySchema,
  severityFromCode,
  skillsDiffToJson,
  WorkspaceIssue,
  WorkspaceIssueSchema,
} from "./types.js";
