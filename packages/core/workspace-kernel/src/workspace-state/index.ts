/**
 * @agentxm/workspace-kernel/workspace-state public API.
 *
 * The workspace-state kernel: settings and lockfile authority, the workspace
 * read model, desired-state and canonical-observation vocabulary, extension
 * paths and layout, and the narrow workspace-state services (`WorkspaceLocation`,
 * readers, and writers). Extension ref and source vocabulary lives in
 * `@agentxm/extension-model`; workspace transactions live in
 * `@agentxm/workspace-kernel/settlement`; plan execution in
 * `@agentxm/workspace-kernel/planning`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Settings and lockfile surfaces
export * from "./desired/settings/index.js";
export * from "./desired/lockfile/index.js";

// Knowledge discovery configuration
export { type ResolvedKnowledgeDiscoveryConfig } from "./desired/discovery-config.js";

// Path safety
export { validatePathSafety, PathTraversalDetected } from "./utils/path-safety.js";

// Workspace-relative display paths
export {
  workspaceFileDisplayPath,
  settingsDisplayPath,
  lockfileDisplayPath,
  acquiredRootDisplayPath,
  acquiredDisplayPath,
  authoredDisplayPath,
  workspaceDisplayPath,
} from "./workspace/display-paths.js";

// Additional settings and lockfile vocabulary consumed beyond the barrels
export { SETTINGS_ENTRY_KEYS, SETTINGS_KNOWN_KEYS } from "./desired/settings/schema.js";
export {
  gitSourceLockFields,
  pathSourceLockFields,
  portableGitSourceLockFields,
  registrySourceLockFields,
} from "./desired/lockfile/entry-fields.js";
export { LOCK_ENTRY_SCHEMA_BY_TYPE } from "./desired/lockfile/schema.js";
export {
  retainedPackageKeyForRef,
  retainedPackageBindings,
  packageAddressClaimForRef,
  acceptedPackageAddressClaims,
  validatePackageAddressClaims,
  type PackageAddressClaim,
} from "./workspace/retained-packages.js";

// Extension path and identity vocabulary
export {
  ACQUIRED_EXTENSIONS_DIR,
  LEGACY_LOCK_FILENAME,
  LOCK_FILENAME,
} from "./workspace/constants.js";
export {
  observeInstallRoot,
  type InstallRootInventory,
  type InstalledPackageEntry,
} from "./workspace/install-root.js";
export {
  acquiredExtensionDisplayPath,
  acquiredPackageRelativePath,
  BUNDLED_SKILL_OWNER,
  bundledSkillCanonicalRoot,
  computeExtensionPathsForLayout,
} from "./workspace/extension-paths.js";
export { computeSourceHash } from "./workspace/rendered-files.js";
export { computePackageContentHash } from "./workspace/package-hash.js";
export {
  computeMaterializedTreeIntegrity,
  MaterializedTreeInvalid,
  TreeIntegritySchema,
  type TreeIntegrity,
} from "./workspace/materialized-tree.js";
export { sanitizeName } from "./workspace/extension-name.js";
export { computePackPathsForLayout } from "./workspace/pack-paths.js";
export { computePackManifestContentIdentity } from "./workspace/pack-manifest-content-identity.js";
export {
  decodePackManifestDocument,
  observePackManifest,
  type PackManifestObservation,
  type PackManifestsPort,
} from "./workspace/pack-manifests.js";
export { MaterializedFileTargetSchema } from "./workspace/materialized-file-target.js";
export {
  computeSkillPathsForLayout,
  readSkillDirectoryName,
  type SkillPathSource,
} from "./workspace/skill-paths.js";
export {
  acquisitionConfiguredEntries,
  enabledConfiguredEntries,
} from "./workspace/configured-entry.js";

// Rendering of the state and settlement failure families into the
// serialized step vocabulary.
export {
  candidateFingerprintFailedToStepFailure,
  configErrorToStepFailure,
  configFailures,
  restorationIncompleteToStepFailure,
  workspaceRestorationFailures,
  workspaceStateFailures,
  workspaceStateReadFailures,
  workspaceStateReadFailureToStepFailure,
  workspaceTransactionFailures,
  workspaceTransactionFailureToStepFailure,
} from "./step-failures.js";

// Plan-facing workspace vocabulary
export {
  ConfiguredAgentOutcomesProvider,
  ConfiguredAgentOutcomesUnavailable,
  resolveConfiguredExtensionObservations,
  type ConfiguredExtensionObservation,
  type ConfiguredAgentOutcomesRequest,
  type ConfiguredAgentOutcomesProviderService,
} from "./workspace/configured-agent-outcomes-provider.js";

// Layout and paths
export {
  DEFAULT_AUTHORED_DIRECTORIES,
  resolveAuthoredDirectories,
  resolveProjectWorkspaceLayout,
  resolveUserWorkspaceLayout,
  type WorkspaceLayout,
} from "./workspace/layout.js";
export {
  USER_WORKSPACE_DIRECTORY,
  locateWorkspace,
  resolveUserAxmHome,
  resolveUserHome,
  resolveUserWorkspaceRoot,
  type LocatedWorkspace,
} from "./workspace/paths.js";

// Managed filesystem primitives
export { createSymlink } from "./workspace/create-symlink.js";

// Read-model record rows + lifecycle views
export {
  configuredRowsByName,
  installedRowsByName,
  type ConfiguredRecordRow,
} from "./observed/records.js";

export {
  effectiveDesiredConstraint,
  UNCONSTRAINED_DESIRED_NODE,
  isRequiredByAnotherOrigin,
  isSourcedDesiredExtension,
  type DesiredExtensionNode,
  type DesiredExtensionOrigin,
  type DesiredConstraintConflict,
  type DesiredConstraintContributor,
  type DesiredConstraintProposal,
  type DesiredEffectiveConstraint,
  type DesiredPackMembership,
  type DesiredStateGraph,
  type DesiredStateProblem,
} from "./workspace/desired-state-graph.js";
// The explicit input view an evaluation derives from, and the pure evaluation.
export { evaluateDesiredState } from "./workspace/desired-state-evaluation.js";
// Evidence-bearing queries over one evaluation.
export {
  contributorSetBlockers,
  contributorSetComplete,
  desiredProblemSubject,
  desiredReachability,
  desiredStateIdentity,
  desiredStateSettled,
  problemsAffectingPack,
  problemsAffectingSubject,
  unresolvedPackRoutes,
  unresolvedPackRoutesText,
  type DesiredContributorBlockers,
} from "./workspace/desired-state-queries.js";
// Whether desired state reaches an accepted lock row.
export {
  acceptedRowKey,
  acceptedRowReachability,
  desiredNodeReachesRow,
  desiredReachesAcceptedRow,
} from "./workspace/accepted-reachability.js";
// The typed identity a desired-graph node carries.
export {
  desiredIdentityFqn,
  desiredIdentityOfRef,
  desiredMcpSource,
  desiredMcpSourceKey,
  desiredPackageKey,
  formatDesiredIdentity,
  formatDesiredSourceAuthority,
  sameAcceptedResolution,
  sameSourceAuthority,
  sameSourceIdentity,
  type DesiredAuthority,
  type DesiredNodeIdentity,
  type DesiredSourceAuthority,
} from "./workspace/desired-identity.js";
export { packMemberSourceAuthority } from "./workspace/pack-member-source-authority.js";
export {
  desiredStateProblemText,
  desiredStateProblemsText,
  formatConstraintContributors,
  packManifestInvalidText,
  packManifestUnavailableText,
} from "./workspace/desired-state-problem-text.js";
export {
  observeCanonicalExtension,
  observeAcceptedResolution,
  observeAcceptedCanonicalReuse,
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
  type AcceptedCanonicalRefError,
} from "./workspace/accepted-canonical-ref.js";
export { isObservedInstalled } from "./workspace/observed-installed.js";

// Configured entry vocabulary (resolution policy lives in extension-resolution)
export { resolveWorkspaceExtensionRef } from "./workspace/configured-entry-resolution/workspace-ref.js";

// Lock entry translation
export {
  acquiredExtensionDisplayPathFromLockEntry,
  extensionPathSourceFromLockEntry,
  lockEntryToRef,
  lockEntryToSourceParams,
  lockEntryMatchesSourceLocator,
  lockEntryVersion,
  isGitLockEntry,
  isPathLockEntry,
  type LockEntry,
  type LockEntryToRefError,
} from "./workspace/lock-entry.js";
export { McpSourceIdentity, McpSourceKey } from "./workspace/mcp-source-identity.js";

// Workspace read model
export {
  makeWorkspaceReadModel,
  WorkspaceReadModelConfig,
  type WorkspaceReadModel,
} from "./observed/service.js";
export { SCANNER_IO_CONCURRENCY, makeScannerFileSystem } from "./observed/scanners/fs-helpers.js";
export { AgentRootResolverLive } from "./observed/agent-root-resolver.js";
export {
  ExtensionInventoryLifecycleSchema,
  ExtensionInventoryRowSchema,
  ExtensionInventorySchema,
  countExtensionInventory,
  type ExtensionInventory,
  type ExtensionInventoryLifecycle,
  type ExtensionInventoryRow,
} from "./observed/extensions/inventory.js";
export {
  scanAllSubagentFiles,
  skillsInDir,
  type AgentSubagentSummary,
} from "./observed/discovery/index.js";
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
  PackMemberBinding,
} from "./observed/extensions/index.js";
export { packMemberBindings } from "./workspace/desired-pack-members.js";

// Narrow workspace-state services

export {
  WorkspaceLocation,
  captureNativeDirectoryInputs,
  type WorkspaceLocationService,
} from "./workspace/location.js";
export {
  SettingsReader,
  bindRegistrySource,
  type SettingsReaderService,
} from "./workspace/settings-reader.js";
export {
  BUILT_IN_REGISTRY_NAME,
  selectRegistry,
  type SourceConfigurationSnapshot,
} from "./workspace/registry-selection.js";
export { LockfileReader } from "./workspace/lockfile-reader.js";
export { readOtherScopeState } from "./workspace/other-scope-reader.js";
export {
  captureDesiredStateInputs,
  DesiredStateReader,
  type DesiredStateReaderService,
} from "./workspace/desired-state-reader.js";
export { WorkspaceRecords, type WorkspaceRecordsService } from "./workspace/workspace-records.js";
export { ExtensionPaths } from "./workspace/extension-paths-service.js";
export { SettingsWriter, type SettingsWriterService } from "./workspace/settings-writer.js";
export {
  AcceptedResolutionWriter,
  type AcceptedResolutionWriterService,
} from "./workspace/accepted-resolution-writer.js";
export {
  DesiredStateWriter,
  type DesiredStateWriterService,
} from "./workspace/desired-state-writer.js";
export { settingsEntries, lockEntries } from "./workspace/entry-accessors.js";
export type { LockEntryByType } from "./workspace/entry-accessors.js";

export {
  type WorkspaceStateError,
  type WorkspaceStateOptions,
  type WorkspaceSettingsReadFailure,
  type WorkspaceLockfileReadFailure,
  type WorkspaceStateReadFailure,
  type WorkspaceSettingsMutationFailure,
  type WorkspaceLockfileMutationFailure,
  type WorkspaceStateMutationFailure,
  type SetPackArgs,
  type SetMcpServerArgs,
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

// Read-model, settings-read, and lockfile-read failure families
export {
  SkillDiscoveryRootInvalid,
  SubagentScanFailed,
  WorkspaceRootEscape,
} from "./observed/errors.js";
export {
  LockfileDecodeError,
  LockfileIoError,
  LockfileParseError,
  LockfileVersionUnsupported,
  type LockfileReadError,
} from "./desired/lockfile/errors.js";
export {
  SettingsDecodeError,
  SettingsIoError,
  SettingsParseError,
  type SettingsReadError,
} from "./desired/settings/errors.js";

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
  RuntimeIgnoreWriteError,
  SettingsEntryMissing,
  SupersededCanonicalRemovalFailed,
  SymlinkCreationError,
  WorkspaceLayoutError,
  WorkspaceNotInitialized,
  WorkspaceSourceInvalid,
} from "./workspace/errors.js";

export { setupScopeSupport } from "./workspace/setup-scope-support.js";
export {
  configuredAgentLifecycleOutcomes,
  EXTENSION_CONFIGURED_AGENT_POLICY,
} from "./workspace/configured-agent-outcomes.js";

export { lockEntrySemanticallyEqual, stableJson } from "./workspace/accepted-resolution-writer.js";

export {
  withDocumentRoundTripBatch,
  type DocumentRoundTripBatch,
} from "./desired/document-round-trip.js";

export {
  hookConfigurationHash,
  hookReceiptFilename,
  readHookEvidence,
} from "./observed/hooks/evidence.js";
export { WorkspaceReadViews, withWorkspaceReadView } from "./workspace/read-view.js";

export { ensureWorkspaceTransientIgnores } from "./workspace/runtime-ignores.js";
