/**
 * Workspace module - plan-based orchestration for extension management.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Plan types and helpers
export type {
  Job,
  JobStep,
  JobStepResult,
  Operation,
  OperationMap,
  OperationMapFromUnion,
  OperationResult,
  OperationUnion,
  Plan,
  PlannedJobStep,
  Readiness,
} from "./plan.js";
export { makeStep } from "./plan.js";

// Plan display
export { displayPlan } from "./display-plan.js";

// Plan apply
export {
  applyPlan,
  type ExecutionContext,
  type Handlers,
  type OperationHandler,
} from "./apply-plan.js";

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
