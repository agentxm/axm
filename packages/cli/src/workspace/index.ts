/**
 * Workspace module - plan-based orchestration for extension management.
 *
 * Plan types and pure logic re-exported from @axm.sh/core/unstable/workspace.
 * CLI-specific modules (resolve-plan, display-plan, service implementation)
 * remain in this package.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Plan types (re-exported from core)
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
} from "@axm.sh/core/unstable/workspace";

// Path utilities (re-exported from core)
export { getAxmDir, getProjectDir, getUserScopeDir } from "@axm.sh/core/unstable/workspace";

// Scope utilities (re-exported from core)
export {
  WORKSPACE_SCOPES,
  DEFAULT_WORKSPACE_SCOPE,
  type WorkspaceScope,
} from "@axm.sh/core/unstable/workspace";

// Workspace context service types (from core)
export {
  Workspace,
  type SetCommandArgs,
  type SetMcpServerArgs,
  type SetPackArgs,
  type SetSkillArgs,
  type WorkspaceContextService,
  type WorkspaceContextError,
  type WorkspaceContextOptions,
} from "@axm.sh/core/unstable/workspace";

// Taxonomy types (from core)
export type {
  ConfiguredSkill,
  ImplicitSkill,
  UnmanagedSkill,
  InstalledSkill,
  ClassifiedSkill,
  ConfiguredCommand,
  ImplicitCommand,
  UnmanagedCommand,
  InstalledCommand,
  ClassifiedCommand,
  ConfiguredExtensionRef,
  ImplicitExtensionRef,
  UnmanagedExtensionRef,
  InstalledExtensionRef,
  ClassifiedExtensionRef,
} from "@axm.sh/core/unstable/workspace";

// Workspace layer (CLI implementation)
export { layer } from "./service.js";

// Resolve plan (CLI-only free function)
export { resolvePlan } from "./resolve-plan.js";
