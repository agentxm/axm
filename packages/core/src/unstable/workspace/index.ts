/**
 * Workspace module - plan-based orchestration for extension management.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Plan types
export type {
  CancelledPlan,
  CompletedJobStep,
  ErrorJobStep,
  ExecutedJob,
  ExecutedPlan,
  Job,
  JobStepResult,
  Operation,
  Plan,
  PlanResolution,
  PlannedJobStep,
  PreviewedPlan,
  ReadyJobStep,
  WarnJobStep,
} from "./plan.js";

// Apply plan
export { applyPlan, type OperationHandler } from "./apply-plan.js";

// Path utilities
export { getAxmDir, getProjectDir, getUserScopeDir } from "./paths.js";

// Scope utilities
export { WORKSPACE_SCOPES, DEFAULT_WORKSPACE_SCOPE, type WorkspaceScope } from "./scope.js";

// Classifier
export {
  classifyExtensions,
  isIgnoredName,
  type ClassifiedExtension,
  type ClassifierInput,
  type PackagingKind,
} from "./classifier.js";

// Classifier records
export {
  toClassifiedCommandRecord,
  toClassifiedExtensionRefRecord,
  toClassifiedSkillRecord,
  toConfiguredCommandRecord,
  toConfiguredExternalCommandRecord,
  toConfiguredExternalExtensionRefRecord,
  toConfiguredExternalSkillRecord,
  toConfiguredExtensionRefRecord,
  toConfiguredSkillRecord,
  toImplicitCommandRecord,
  toImplicitExtensionRefRecord,
  toImplicitSkillRecord,
  toInstalledCommandRecord,
  toInstalledExtensionRefRecord,
  toInstalledSkillRecord,
  toUnmanagedCommandRecord,
  toUnmanagedExternalCommandRecord,
  toUnmanagedExternalExtensionRefRecord,
  toUnmanagedExternalSkillRecord,
  toUnmanagedExtensionRefRecord,
  toUnmanagedSkillRecord,
} from "./classifier-records.js";

// Taxonomy types
export type {
  ClassifiedCommand,
  ClassifiedExtensionRef,
  ClassifiedSkill,
  ConfiguredCommand,
  ConfiguredExtensionRef,
  ConfiguredSkill,
  ImplicitCommand,
  ImplicitExtensionRef,
  ImplicitSkill,
  InstalledCommand,
  InstalledExtensionRef,
  InstalledSkill,
  UnmanagedCommand,
  UnmanagedExtensionRef,
  UnmanagedSkill,
} from "./taxonomy-types.js";

// Reconciliation
export {
  buildReconciliationSnapshot,
  dedupeDeclarations,
  runReadRecoverOperation,
  runReconcileMaterializeOperation,
  type ReconciliationSnapshot,
} from "./reconciliation.js";

// Doctor
export {
  diagnoseWorkspaceDoctor,
  type WorkspaceDoctorCheck,
  type WorkspaceDoctorCheckStatus,
  type WorkspaceDoctorDiagnosis,
} from "./doctor.js";

// Sync
export { getWorkspaceSyncReadiness, syncWorkspace, type WorkspaceSyncReadiness } from "./sync.js";

// Reconciliation types
export type {
  AdapterEnvironment,
  DeclarationResolution,
  DeclarationScanResult,
  ReconcileExtensionType,
  ReconciliationAdapter,
  ReconciliationContext,
  ReconciliationDeclaration,
  ReconstructedLockEntry,
  UnresolvedReason,
} from "./reconciliation-types.js";

// Source metadata
export {
  deriveSourceMetaForNonSkill,
  deriveSourceMetaForPacks,
  deriveSourceMetaForSkills,
  deriveSourceMetaFromLockType,
  getBuiltInSources,
  type SourceMeta,
} from "./source-metadata.js";

// Reconciliation adapters registration
export { setReconciliationAdapters, getReconciliationAdapters } from "./reconciliation.js";

// Scan plan readiness
export { scanPlanReadiness, type PlanReadinessReport } from "./scan-plan-readiness.js";

// Augment plan
export {
  augmentPlanWithReconciliation,
  type AugmentedPlanResult,
  type LockfileState,
} from "./augment-plan.js";

// Workspace service tag and interface
export {
  Workspace,
  type WorkspaceContextService,
  type WorkspaceContextError,
  type WorkspaceContextOptions,
  type SetSkillArgs,
  type SetExtensionPackArgs,
  type SetCommandArgs,
  type SetMcpServerArgs,
  type SkillPathSource,
  type SkillDirPaths,
  type ExtensionPackDirPath,
  type ExtensionTarget,
  type ExtensionTargetFor,
  type ExtensionManager,
  type SkillExtensionTarget,
  type PackExtensionTarget,
  type CommandExtensionTarget,
  type McpServerExtensionTarget,
} from "./service-interface.js";

// Workspace service implementation (layer)
export { layer, type WorkspaceLayerOptions } from "./service.js";

// Builtin packs
export {
  materializeBuiltinExtensionPack,
  BUILTIN_EXTENSION_PACK_FQN,
  BUILTIN_EXTENSION_PACK_SCOPE,
  BUILTIN_EXTENSION_PACK_NAME,
  type ResolvedBuiltinExtensionPack,
} from "./builtin-packs.js";

// Initialization
export {
  initializeProjectWorkspace,
  ensureGlobalWorkspaceInitialized,
  ensureProjectWorkspaceInitialized,
} from "./initialization.js";

// Plan resolution
export { resolvePlan } from "./resolve-plan.js";

// Plan display
export { displayPlan } from "./display-plan.js";
