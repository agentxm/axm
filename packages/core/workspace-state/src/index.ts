/**
 * @agentxm/workspace-state public API.
 *
 * The workspace-state kernel: settings and lockfile authority, the workspace
 * read model, desired-state and canonical-observation vocabulary, extension
 * paths and layout, and the narrow workspace-state services (`WorkspaceLocation`,
 * readers, writers) with the transitional `WorkspaceMutations` facade over
 * them. Extension ref and source vocabulary lives in
 * `@agentxm/extension-model`; workspace transactions live in
 * `@agentxm/workspace-transactions`; plan execution in
 * `@agentxm/workspace-operations`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Settings, lockfile, and schema surfaces
export * from "./settings/index.js";
export * from "./lockfile/index.js";
export * from "./schema/index.js";

// Knowledge discovery configuration
export {
  resolveKnowledgeDiscoveryConfig,
  type ResolvedKnowledgeDiscoveryConfig,
} from "./knowledge/discovery-config.js";

// Path safety
export { safeChildPath, validatePathSafety, PathTraversalDetected } from "./utils/path-safety.js";

// Additional settings and lockfile vocabulary consumed beyond the barrels
export { SETTINGS_KNOWN_KEYS } from "./settings/schema.js";
export { gitSourceLockFields } from "./lockfile/entry-fields.js";
export { LOCK_ENTRY_SCHEMA_BY_TYPE } from "./lockfile/schema.js";

// Extension path and identity vocabulary
export { ACQUIRED_EXTENSIONS_DIR, LOCK_FILENAME } from "./workspace/constants.js";
export {
  acquiredExtensionDisplayPath,
  acquiredExtensionDisplayPathFromLockEntry,
  computeExtensionPathsForLayout,
  extensionPathSourceFromLockEntry,
  extensionContentFilename,
  extensionContentPath,
  type ExtensionPathLockEntry,
  type ExtensionPathSource,
  type ExtensionDirPaths,
} from "./workspace/extension-paths.js";
export {
  RenderedFilePathSchema,
  RenderedFilesMapSchema,
  computeSourceHash,
  type RenderedFilePath,
  type RenderedFilesMap,
} from "./workspace/rendered-files.js";
export { computePackageContentHash } from "./workspace/package-hash.js";
export {
  computeMaterializedTreeIntegrity,
  MaterializedTreeInvalid,
  TreeIntegritySchema,
  type TreeIntegrity,
} from "./workspace/materialized-tree.js";
export { sanitizeName, normalizeExtensionName } from "./workspace/extension-name.js";
export { computePackPathsForLayout } from "./workspace/pack-paths.js";
export { computePackManifestContentIdentity } from "./workspace/pack-manifest-content-identity.js";
export {
  MaterializedFileTargetSchema,
  type MaterializedFileTarget,
} from "./workspace/materialized-file-target.js";
export {
  computeSkillPathsForLayout,
  type SkillPathSource,
  type SkillDirPaths,
} from "./workspace/skill-paths.js";
export {
  computeSubagentPathsForLayout,
  subagentContentFilename,
  subagentContentPath,
  type SubagentDirPaths,
  type SubagentPathSource,
} from "./workspace/subagent-paths.js";
export {
  enabledConfiguredEntries,
  isConfiguredEntryEnabled,
  type ConfiguredEntryEnabledState,
} from "./workspace/configured-entry.js";

// Plan-facing workspace vocabulary
export { ArtifactChangeSchema, type ArtifactChange } from "./workspace/artifact-change.js";
export {
  ConfiguredAgentOutcomeSchema,
  type ConfiguredAgentOutcome,
} from "./workspace/configured-agent-outcome.js";
export {
  ConfiguredAgentOutcomesProvider,
  ConfiguredAgentOutcomesUnavailable,
  type ConfiguredAgentOutcomesFailureCategory,
  type ConfiguredAgentOutcomesForState,
  type ConfiguredAgentOutcomesProviderService,
} from "./workspace/configured-agent-outcomes-provider.js";

// Layout and paths
export {
  resolveProjectWorkspaceLayout,
  resolveProjectWorkspaceStatePaths,
  resolveUserWorkspaceLayout,
  type WorkspaceLayout,
} from "./workspace/layout.js";
export {
  AXM_DIR_NAME,
  USER_WORKSPACE_DIRECTORY,
  getProjectRuntimeDir,
  locateWorkspace,
  resolveUserAxmHome,
  resolveUserAxmHomePure,
  resolveUserHome,
  resolveUserWorkspaceRoot,
  resolveUserWorkspaceRootPure,
  type LocatedWorkspace,
} from "./workspace/paths.js";

// Managed filesystem primitives
export { removeIfExists } from "./workspace/remove-if-exists.js";
export { createSymlink, type SymlinkResult } from "./workspace/create-symlink.js";

// Read-model record rows + lifecycle views
export {
  configuredRecordRows,
  configuredRowsByName,
  installedRecordRows,
  installedRowsByName,
  isConfiguredRecordRow,
  isInstalledRecordRow,
  isUnmanagedRecordRow,
  recordRowsByName,
  unmanagedRecordRows,
  unmanagedRowsByName,
  type ConfiguredRecordRow,
  type ImplicitRecordRow,
  type InstalledRecordRow,
  type UnmanagedRecordRow,
} from "./workspace/read-model-record-rows.js";

export type { ReadModelRecordRow, PackagingKind } from "./workspace/read-model-record-types.js";

export {
  getKnowledgeLockEntries,
  getLockedEntries,
  lockEntryVersion,
  type AnyLockEntry,
  type AnyLockMap,
} from "./workspace/locked-entries.js";

export {
  buildDesiredStateGraph,
  isInlineDesiredExtension,
  isSourcedDesiredExtension,
  type DesiredExtensionNode,
  type DesiredExtensionOrigin,
  type DesiredConstraintContributor,
  type DesiredStateGraph,
  type DesiredStateProblem,
  type ProspectivePackRef,
} from "./workspace/desired-state-graph.js";
export {
  desiredStateProblemText,
  desiredStateProblemsText,
} from "./workspace/desired-state-problem-text.js";
export {
  isDesiredExtensionActive,
  type DesiredStateEnabledOrigin,
} from "./workspace/desired-state-enabled.js";
export { validateDesiredPackLock } from "./workspace/desired-pack-lock.js";
export {
  observeCanonicalExtension,
  canonicalPathForAcceptedExtension,
  type AcceptedExtensionResolution,
  type CanonicalConstraintContributor,
  type CanonicalConstraintMismatchObservation,
  type CanonicalObservation,
  type CanonicalObservationStatus,
} from "./workspace/canonical-observation.js";
export {
  acceptedResolutionRef,
  acceptedLockedResolutionRef,
  acceptedLockedCanonicalPath,
  prepareAcceptedCanonicalTransition,
  acceptedCanonicalObservation,
  removableAcceptedCanonicalPath,
  usableAcceptedCanonical,
  usableAcceptedCanonicalObservation,
  usableAcceptedCanonicalRef,
  type AcceptedCanonicalObservation,
  type AcceptedCanonicalRefError,
  type UsableAcceptedCanonical,
  type UsableAcceptedCanonicalObservation,
} from "./workspace/accepted-canonical-ref.js";
export { isObservedInstalled } from "./workspace/observed-installed.js";

// Configured entry vocabulary (resolution policy lives in extension-resolution)
export { resolveWorkspaceExtensionRef } from "./workspace/configured-entry-resolution/workspace-ref.js";

// Lock entry translation
export {
  hookLockEntryToRef,
  knowledgeLockEntryToRef,
  mcpServerLockEntryToRef,
  packLockEntryToRef,
  ruleLockEntryToRef,
  skillLockEntryToRef,
  subagentLockEntryToRef,
  type LockEntrySourceLookupError,
  type LockEntryToRefError,
} from "./workspace/lock-entry-to-ref.js";
export {
  lockEntryToSourceParams,
  printSkillLockSourceLocator,
} from "./workspace/lock-entry-to-source-params.js";
export {
  sourceToLockEntry,
  type SourceToLockEntryInput,
} from "./workspace/source-to-lock-entry.js";

// Source metadata
export { deriveSourceMetaFromLockType, type SourceMeta } from "./workspace/source-metadata.js";
export { mcpRegistryResolutionKey, mcpResolutionKey } from "./workspace/mcp-source-identity.js";

// Workspace read model
export {
  READ_MODEL_EXTENSION_FAMILY_BY_TYPE,
  makeWorkspaceReadModel,
  WorkspaceReadModelConfig,
  type RawSourceBytes,
  type ScopedOwnerApi,
  type ScopedSourceHostsApi,
  type ScopedStateApi,
  type WorkspaceReadModel,
  type WorkspaceReadModelConfigService,
} from "./workspace/read-model/service.js";
export {
  AgentRootResolver,
  AgentRootResolverLive,
} from "./workspace/read-model/agent-root-resolver.js";
export {
  ExtensionInventoryClassificationSchema,
  ExtensionInventoryLifecycleSchema,
  ExtensionInventoryRowSchema,
  ExtensionInventorySchema,
  projectExtensionInventory,
  type ExtensionInventory,
  type ExtensionInventoryClassification,
  type ExtensionInventoryLifecycle,
  type ExtensionInventoryObservation,
  type ExtensionInventoryRow,
  type LifecycleInventoryCandidate,
  type ProjectExtensionInventoryInput,
} from "./workspace/read-model/extensions/inventory.js";
export {
  getPriorityDirectories,
  parsePluginManifests,
  scanAgentSubagentFiles,
  scanAllSubagentFiles,
  skillsInDir,
  type AgentSubagentSummary,
  type DetectedSubagentFile,
  type DiscoveredSkill,
  type DiscoveryOptions,
} from "./workspace/read-model/discovery/index.js";
export type {
  ActualMcpServer,
  ActualPack,
  ActualSkill,
  ActualSubagent,
  InstalledHook,
  InstalledKnowledgeBundle,
  InstalledMcpServer,
  InstalledPack,
  InstalledRule,
  InstalledSkill,
  InstalledSubagent,
  UnmanagedMcpServer,
} from "./workspace/read-model/extensions/index.js";

// Fixture-spec data shapes: declarative workspace-tree descriptions shared by
// the read-model fixtures and lint's workspace fixture interpreter. The
// builder itself lives behind `./testing`.
export type {
  FileSpec,
  FixtureSpec,
  ScopeFiles,
  TreeFiles,
} from "./workspace/read-model/__fixtures__/builder.js";

// Narrow workspace-state services
export { WorkspaceLocation, type WorkspaceLocationService } from "./workspace/location.js";
export { SettingsReader, type SettingsReaderService } from "./workspace/settings-reader.js";
export { LockfileReader, type LockfileReaderService } from "./workspace/lockfile-reader.js";
export { readOtherScopeState, type OtherScopeState } from "./workspace/other-scope-reader.js";
export {
  DesiredStateReader,
  type DesiredStateReaderService,
} from "./workspace/desired-state-reader.js";
export { WorkspaceRecords, type WorkspaceRecordsService } from "./workspace/workspace-records.js";
export { ExtensionPaths, type ExtensionPathsService } from "./workspace/extension-paths-service.js";
export { SettingsWriter, type SettingsWriterService } from "./workspace/settings-writer.js";
export {
  AcceptedResolutionWriter,
  type AcceptedResolutionWriterService,
} from "./workspace/accepted-resolution-writer.js";
export {
  DesiredStateWriter,
  type DeclareArgsByType,
  type DesiredStateWriterService,
} from "./workspace/desired-state-writer.js";
export type {
  LockEntriesOf,
  LockEntryByType,
  SettingsEntriesOf,
  SettingsEntryByType,
} from "./workspace/entry-accessors.js";

// TRANSITIONAL workspace mutation facade — removed when the last handler
// migrates to the narrow services above.
export {
  WorkspaceMutations,
  type WorkspaceMutationsService,
  type WorkspaceMutationsError,
  type WorkspaceMutationsOptions,
  type WorkspaceSettingsReadFailure,
  type WorkspaceLockfileReadFailure,
  type WorkspaceStateReadFailure,
  type WorkspaceSettingsMutationFailure,
  type WorkspaceLockfileMutationFailure,
  type WorkspaceStateMutationFailure,
  type SetSkillArgs,
  type SetPackArgs,
  type SetMcpServerArgs,
  type SetSubagentArgs,
  type SetRuleArgs,
  type SetHookArgs,
  type SetKnowledgeArgs,
  type PackDirPath,
  type ExtensionTarget,
  type ExtensionTargetFor,
  type LockfileState,
  type SkillExtensionTarget,
  type PackExtensionTarget,
  type McpServerExtensionTarget,
  type SubagentExtensionTarget,
  type RuleExtensionTarget,
  type HookExtensionTarget,
  type KnowledgeExtensionTarget,
} from "./workspace/service-interface.js";

// Read-model per-source typed failure families
export {
  LockfileDecodeError,
  LockfileIoError,
  LockfileParseError,
  LockfileVersionUnsupported,
  SettingsDecodeError,
  SettingsIoError,
  SettingsParseError,
  SkillDiscoveryRootInvalid,
  SubagentScanFailed,
  WorkspaceRootEscape,
  type LockfileReadError,
  type SettingsReadError,
} from "./workspace/read-model/errors.js";

// Workspace-state typed failure families
export {
  AcceptedResolutionMissing,
  CanonicalPathRemovalError,
  DesiredPackGraphIncomplete,
  InlineExtensionSourceMissing,
  InvalidAgentId,
  LockedSkillMissing,
  LockEntryEndpointConflict,
  LockEntryNameInvalid,
  LockEntrySourceMissing,
  LockEntrySourceTypeConflict,
  LockEntryUrlInvalid,
  PackageContentHashFailed,
  SettingsEntryMissing,
  SupersededCanonicalRemovalFailed,
  SymlinkCreationError,
  WorkspaceLayoutError,
  WorkspaceNotInitialized,
  WorkspaceSourceInvalid,
} from "./workspace/errors.js";

export {
  setupScopeSupport,
  setupScopeSupportOutcomes,
  type SetupScopeSupportCategory,
  type SetupScopeSupportOutcome,
  type SetupScopeSupportReasonCode,
  type SetupScopeSupportStatus,
} from "./workspace/setup-scope-support.js";
export {
  configuredAgentLifecycleOutcomes,
  EXTENSION_CONFIGURED_AGENT_POLICY,
  type ConfiguredAgentLifecycleState,
} from "./workspace/configured-agent-outcomes.js";
