/**
 * Workspace module - plan-based orchestration for extension management.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Plan types (new readiness-based model)
export type {
  CompletedJobStep,
  ErrorJobStep,
  ExecutedJob,
  ExecutedPlan,
  Job,
  JobStepResult,
  Plan,
  PlannedJobStep,
  ReadyJobStep,
  WarnJobStep,
} from "./plan.js";

// Legacy plan types (used by non-migrated operation handlers)
export type { Operation, OperationResult, Readiness } from "./plan.js";

// Plan bridge (legacy compatibility for non-migrated handlers)
export {
  bridgeLegacyPlan,
  makeLegacyStep,
  type LegacyPlan,
  type LegacyPlannedStep,
} from "./plan-bridge.js";

// Plan display
export { displayPlan } from "./display-plan.js";

// Plan apply
export { applyPlan, type OperationHandler } from "./apply-plan.js";

// Lockfile state (used by reconciliation)
export type { LockfileState } from "./service.js";

// Path utilities
export { getAxmDir, getGlobalDir, getProjectDir } from "./paths.js";

// Workspace context service (for CLI commands)
export {
  layer,
  type SetCommandArgs,
  type SetMcpServerArgs,
  type SetPackArgs,
  type SetSkillArgs,
  type WorkspaceContextService,
  type WorkspaceContextError,
  type WorkspaceContextOptions,
  Workspace as Workspace,
  // Taxonomy types
  type ConfiguredSkill,
  type ImplicitSkill,
  type UnmanagedSkill,
  type InstalledSkill,
  type ClassifiedSkill,
  type ConfiguredCommand,
  type ImplicitCommand,
  type UnmanagedCommand,
  type InstalledCommand,
  type ClassifiedCommand,
  type ConfiguredExtensionRef,
  type ImplicitExtensionRef,
  type UnmanagedExtensionRef,
  type InstalledExtensionRef,
  type ClassifiedExtensionRef,
} from "./service.js";
