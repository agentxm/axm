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

// Path utilities
export { getAxmDir, getProjectDir, getUserScopeDir } from "./paths.js";

// Scope utilities
export { WORKSPACE_SCOPES, DEFAULT_WORKSPACE_SCOPE, type WorkspaceScope } from "./scope.js";

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
