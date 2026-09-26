/**
 * @agentxm/workspace/desired-state public API.
 *
 * The workspace-state kernel: settings and lockfile authority, the workspace
 * read model, desired-state and canonical-observation vocabulary, extension
 * paths and layout, and the narrow workspace-state services (`WorkspaceLocation`,
 * readers, and writers). Extension ref and source vocabulary lives in
 * `@agentxm/extension-model`; workspace transactions live in
 * `@agentxm/workspace/transitions/settlement`; plan execution in
 * `@agentxm/workspace/transitions/planning`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Settings and lockfile surfaces
export * from "./settings/index.js";
export * from "./lockfile/index.js";

// Knowledge discovery configuration
export {
  resolveKnowledgeDiscoveryConfig,
  type ResolvedKnowledgeDiscoveryConfig,
} from "./knowledge/discovery-config.js";

// Path safety
export { validatePathSafety, PathTraversalDetected } from "./utils/path-safety.js";

// Workspace-relative display paths
export {
  USER_WORKSPACE_DISPLAY_ROOT,
  workspaceFileDisplayPath,
  settingsDisplayPath,
  lockfileDisplayPath,
  acquiredRootDisplayPath,
  acquiredDisplayPath,
  authoredDisplayPath,
  workspaceDisplayPath,
} from "./workspace/display-paths.js";

// Additional settings and lockfile vocabulary consumed beyond the barrels
export { SETTINGS_KNOWN_KEYS } from "./settings/schema.js";
export {
  gitSourceLockFields,
  pathSourceLockFields,
  portableGitSourceLockFields,
  registrySourceLockFields,
} from "./lockfile/entry-fields.js";
export { LOCK_ENTRY_SCHEMA_BY_TYPE } from "./lockfile/schema.js";

// Extension path and identity vocabulary
export { ACQUIRED_EXTENSIONS_DIR, LOCK_FILENAME } from "./workspace/constants.js";
export {
  isInstallRootStagingName,
  observeInstallRoot,
  type InstallRootEntry,
  type InstallRootInventory,
  type InstalledPackageEntry,
  type ObserveInstallRootArgs,
  type UnrecognizedInstallRootEntry,
} from "./workspace/install-root.js";
export {
  acquiredExtensionDisplayPath,
  acquiredExtensionDisplayPathFromLockEntry,
  BUNDLED_SKILL_OWNER,
  bundledSkillCanonicalRoot,
  computeExtensionPathsForLayout,
  extensionPathSourceFromLockEntry,
  extensionContentFilename,
  extensionContentPath,
  type ExtensionPathSource,
  type ExtensionDirPaths,
} from "./workspace/extension-paths.js";
export {
  RenderedFilePathSchema,
  computeSourceHash,
  type RenderedFilePath,
} from "./workspace/rendered-files.js";
export { computePackageContentHash } from "./workspace/package-hash.js";
export {
  computeMaterializedTreeIntegrity,
  MaterializedTreeInvalid,
  TreeIntegritySchema,
  type MaterializedTreeIntegrityOptions,
  type TreeIntegrity,
} from "./workspace/materialized-tree.js";
export { sanitizeName, normalizeExtensionName } from "./workspace/extension-name.js";
export { computePackPathsForLayout, type PackDirPath } from "./workspace/pack-paths.js";
export { computePackManifestContentIdentity } from "./workspace/pack-manifest-content-identity.js";
export {
  observePackManifest,
  PackManifests,
  type LocatedPackManifest,
  type PackManifestObservation,
  type PackManifestsPort,
} from "./workspace/pack-manifests.js";
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
  acquisitionConfiguredEntries,
  enabledConfiguredEntries,
  isConfiguredEntryEnabled,
  type ConfiguredEntryAcquisitionState,
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
  resolveConfiguredAgentOutcomes,
  type ConfiguredAgentOutcomesRequest,
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
  USER_WORKSPACE_DIRECTORY,
  getProjectRuntimeDir,
  locateWorkspace,
  resolveUserAxmHome,
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
  type InstalledRecordRow,
  type UnmanagedRecordRow,
  WorkspaceRecordRowSchema,
  type WorkspaceRecordRow,
} from "./workspace/read-model/records.js";

export {
  buildDesiredStateGraph,
  effectiveDesiredConstraint,
  settleDesiredConstraint,
  settleDesiredNodeConstraint,
  UNCONSTRAINED_DESIRED_NODE,
  isInlineDesiredExtension,
  isRequiredByAnotherOrigin,
  isSourcedDesiredExtension,
  originsOutsidePacks,
  type DesiredExtensionNode,
  type DesiredExtensionOrigin,
  type DesiredConstraintConflict,
  type DesiredConstraintContributor,
  type DesiredConstraintProposal,
  type DesiredEffectiveConstraint,
  type DesiredStateGraph,
  type DesiredStateProblem,
  type ProspectivePackRef,
} from "./workspace/desired-state-graph.js";
// Whether desired state reaches an accepted lock row.
export {
  acceptedRowKey,
  desiredNodeReachesRow,
  desiredReachesAcceptedRow,
  type AcceptedRowRef,
} from "./workspace/accepted-reachability.js";
// The typed identity a desired-graph node carries.
export {
  desiredIdentityFqn,
  desiredIdentityOfRef,
  desiredMcpSourceKey,
  desiredPackageKey,
  formatDesiredIdentity,
  formatDesiredSourceAuthority,
  locatorAuthority,
  sameDesiredIdentity,
  sameDesiredPackage,
  sameDesiredSourceAuthority,
  type DesiredAuthority,
  type DesiredNodeIdentity,
  type DesiredPackIdentity,
  type DesiredRegistryBinding,
  type DesiredSourceAuthority,
} from "./workspace/desired-identity.js";
export {
  packMemberSourceAuthority,
  type PackMemberSourceView,
} from "./workspace/pack-member-source-authority.js";
export {
  desiredStateProblemText,
  desiredStateProblemsText,
  formatConstraintContributors,
  packManifestContentMismatchText,
} from "./workspace/desired-state-problem-text.js";
export {
  validateDesiredPackLock,
  type DesiredPackLockValidation,
} from "./workspace/desired-pack-lock.js";
export {
  observeCanonicalExtension,
  observeAcceptedCanonicalReuse,
  canonicalPathForAcceptedExtension,
  desiredConstraintContributors,
  type RequestedCanonicalRef,
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
  observeDesiredCanonical,
  removableAcceptedCanonicalPath,
  usableAcceptedCanonical,
  usableAcceptedCanonicalFrom,
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
  lockEntryToRef,
  lockEntrySource,
  lockEntryToSourceParams,
  lockEntryMatchesSourceLocator,
  printSkillLockSourceLocator,
  lockEntryVersion,
  isRegistryLockEntry,
  isGitLockEntry,
  isPathLockEntry,
  type LockEntry,
  type LockEntryToRefDeps,
  type LockEntrySourceLookupError,
  type LockEntryToRefError,
} from "./workspace/lock-entry.js";
export {
  mcpRegistryResolutionKey,
  mcpResolutionKey,
  mcpWorkspaceSourceKey,
} from "./workspace/mcp-source-identity.js";

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
export { makeScannerFileSystem } from "./workspace/read-model/scanners/fs-helpers.js";
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
  type ExtensionInventoryRow,
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
  PackMemberBinding,
} from "./workspace/read-model/extensions/index.js";
export { packMemberBindings } from "./workspace/desired-pack-members.js";

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
export { WorkspaceDocuments, type WorkspaceDocumentsService } from "./workspace/documents.js";
export { WorkspaceLocation, type WorkspaceLocationService } from "./workspace/location.js";
export {
  SettingsReader,
  bindRegistrySource,
  registryBaseUrl,
  type BoundRegistrySource,
  type RegistrySourceHost,
  type RegistryTarget,
  type RegistryTargetSelection,
  type SettingsReaderService,
} from "./workspace/settings-reader.js";
export { LockfileReader, type LockfileReaderService } from "./workspace/lockfile-reader.js";
export { readOtherScopeState, type OtherScopeState } from "./workspace/other-scope-reader.js";
export {
  DesiredStateReader,
  type DesiredStateReaderService,
  type DesiredStateGraphInputs,
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
export { settingsEntries, lockEntries } from "./workspace/entry-accessors.js";
export type {
  LockEntriesOf,
  LockEntryByType,
  SettingsEntriesOf,
  SettingsEntryByType,
} from "./workspace/entry-accessors.js";

export {
  type WorkspaceStateError,
  type WorkspaceStateOptions,
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
} from "./workspace/contracts.js";

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

export { lockEntrySemanticallyEqual } from "./workspace/accepted-resolution-writer.js";
