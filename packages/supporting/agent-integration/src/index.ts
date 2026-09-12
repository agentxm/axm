/**
 * @agentxm/agent-integration public API.
 *
 * Everything AXM knows about a coding agent's native surfaces: detection,
 * path primitives, the per-agent `CodingAgent` adapter, subagent rendering,
 * MCP entry projection and config writing, hook-group editing, the ownership
 * marker grammar, and the YAML/TOML/JSON codec wrappers those writers use.
 *
 * Every input crosses as plain data. Native writes go through the
 * `NativeWriteAuthority` port so the workspace core keeps protection and
 * durable-change accounting. Environment-backed layers live behind `./live`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Detection (effectful)
export {
  AgentExecutableResolver,
  detectAgent,
  detectAgentInRoot,
  detectAgentScopeResults,
  detectAgentScopes,
  detectAgents,
  detectAgentsForScope,
  detectAgentsInRoot,
  type AgentScopeDetection,
  type AgentExecutableResolverService,
} from "./detection.js";
export {
  AgentPresenceProbe,
  AgentPresenceUnavailable,
  type AgentPresenceProbeService,
} from "./agent-presence.js";

// Failure vocabulary
export {
  AgentDetectionFailed,
  HookConfigInvalid,
  HookIoFailed,
  McpConfigInvalid,
  McpConfigIoFailed,
  McpDefinitionInvalid,
  McpEntryUnmanaged,
  McpOwnershipMarkerInvalid,
  McpSharedTargetConflict,
  SubagentIoFailed,
  WriteBackupRetained,
  type AgentIntegrationError,
  type CodingAgentFailure,
  type NativeFormatFailure,
} from "./errors.js";

// Native-write port
export {
  NativeWriteAuthority,
  NativeWriteRefused,
  type NativeWriteAuthorityService,
  type NativeWriteRecord,
} from "./native-write-authority.js";

// Constants (path helpers)
export { getHome, getConfigHome } from "./constants.js";

// Catalog-derived agent path helpers
export {
  agentSkillsProjectDir,
  agentSubagentsProjectDir,
  agentSubagentsProjectDirOptional,
} from "./descriptor-paths.js";

// Scope wording
export { userScopeRefusal, type UserScopedExtension } from "./scope-refusal.js";

// Coding-agent adapters
export {
  type AddMcpServerArgs,
  type AddSubagentArgs,
  type CodingAgent,
  type McpServerSyncFallbackSource,
  type McpServerSyncOutcome,
  type McpServerSyncTarget,
  type NativeArtifactChange,
  type RemoveMcpServerArgs,
  type RemoveSubagentArgs,
  type ResolveSkillsDirArgs,
  type ResolveSkillsDirOutcome,
  type ResolveSubagentsDirArgs,
  type ResolveSubagentsDirOutcome,
  type SubagentSyncOutcome,
} from "./agents/coding-agent.js";
export {
  AGENT_RUNTIME_OVERRIDES,
  codingAgentForId,
  codingAgentFromDescriptor,
} from "./agents/adapters.js";

// Ownership marker grammar and pure managed-region edits
export {
  commentStyleForTarget,
  markerForFile,
  MARKER_KIND_END,
  MARKER_KIND_FILE,
  MARKER_KIND_POINT,
  MARKER_KIND_START,
  MARKER_VERSION,
  parseMarker,
  sameRegionIdentity,
  serializeMarker,
  type FileCommentStyle,
  type ManagedMarker,
  type MarkerParseResult,
  type RegionMarker,
  type RegionName,
} from "./managed-markers.js";
export {
  inspectManagedRegion,
  renderManagedRegion,
  type ManagedRegionState,
} from "./managed-regions.js";
export {
  managedKeyedBlockNames,
  reconcileKeyedBlock,
  type KeyedBlockReconciliation,
} from "./managed-regions-keyed-block.js";
export {
  reconcilePatternList,
  type PatternListReconciliation,
} from "./managed-regions-pattern-list.js";

// Subagent rendering and native publication
export {
  buildRooModeEntry,
  mergeRooModes,
  removeRooMode,
  renderSubagent,
  rendered,
  selectSubagentRenderer,
  skipped,
  splitBody,
  type RooModeEntry,
  type RooModeResult,
} from "./subagents/rendering/index.js";
export {
  type LossyRenderingWarning,
  type OwnershipBannerText,
  type SubagentRendered,
  type SubagentRenderer,
  type SubagentRenderInput,
  type SubagentRenderOutcome,
  type SubagentRenderOutput,
  type SubagentSkipped,
} from "./subagents/rendering/types.js";
export {
  addRooSubagent,
  addSubagentViaResolve,
  dirOutcomeToSubagentSyncOutcome,
  removeRooSubagent,
  removeSubagentFiles,
  removeSubagentViaResolve,
  writeSubagentFiles,
  type SubagentSyncFailure,
} from "./subagents/sync.js";

// Agent overrides
export {
  applyOverrides,
  warnOnOrphanOverrides,
  type AgentOverrides,
  type AllAgentOverrides,
} from "./agent-overrides.js";

// MCP native format
export {
  AXM_MCP_METADATA_KEY,
  AxmMcpMetadataSchema,
  isAxmManagedMcpEntry,
  readAxmMcpMetadata,
  type AxmMcpMetadata,
} from "./mcps/entry-semantics.js";
export { buildAxmMcpMetadata, buildAxmMcpMetadataFromSettingsSource } from "./mcps/metadata.js";
export {
  inferInlineRemoteTransport,
  projectExpectedEntry,
  renderEnvValue,
  type ExpectedAgentEntry,
  type InlineRemoteTransport,
  type InlineRemoteTransportInference,
  type McpServerDeclaration,
  type ProjectExpectedEntryArgs,
} from "./mcps/expected-entry.js";
export {
  resolveMcpServer,
  type McpResolution,
  type ResolveMcpServerArgs,
} from "./mcps/resolution.js";
export {
  removeAgentMcpConfig,
  resolveAgentMcpConfigTargetPath,
  writeAgentMcpConfig,
  type AgentMcpConfigWriteResult,
  type AgentMcpConfigWriteTarget,
  type RemoveAgentMcpConfigArgs,
  type WriteAgentMcpConfigArgs,
} from "./mcps/config-writer.js";
export {
  resolveSharedMcpTarget,
  type ResolvedSharedMcpTarget,
  type SharedMcpTargetConflict,
  type SharedMcpTargetMember,
  type SharedMcpTargetResolution,
  type SharedMcpTransport,
} from "./mcps/shared-target.js";
export { groupConfiguredMcpTargets, type McpTargetGroup } from "./mcps/targeting.js";
export {
  addMcpServerConfigFirst,
  addMcpServerConfigOnly,
  decodeMcpServerManifestAt,
  addMcpServerFromManifest,
  addMcpServerMixed,
  pruneManagedMcpServersForAgent,
  removeMcpServerConfigFirst,
  removeMcpServerConfigOnly,
  removeMcpServerFromManifest,
  removeMcpServerMixed,
  runCliInvocation,
  syncInlineMcpServerToAgent,
  syncInlineMcpServerToAgents,
  syncManifestMcpServerToAgents,
  validateManifestMcpServerTargets,
  type CliInvocation,
  type CliInvocationResult,
  type ConfigFirstStrategy,
  type McpConfigSyncFailure,
  type MixedStrategyConfig,
  type PruneManagedMcpServersArgs,
  type SyncInlineMcpServerArgs,
  type SyncManifestMcpServerArgs,
  type ValidateManifestMcpServerTargetsArgs,
} from "./mcps/sync.js";

// Hook-group editing
export {
  ambiguousHookCommands,
  isManagedHookEntry,
  managedHookCommands,
  managedHookUnits,
  pruneManagedHooksFromJson,
  readAmbiguousHookCommands,
  readManagedHookCommands,
  readManagedHookUnits,
  stripManagedHookGroups,
  stripManagedHooksFromJson,
  updateHooksJson,
  type ManagedHookUnit,
} from "./hooks/managed-groups.js";

// Codec wrappers used by the native writers
export {
  extractTomlQuotedStrings,
  parseTomlInlineString,
  parseTomlInlineTableArray,
  parseTomlStringEntries,
  parseTomlValue,
  readTomlSection,
  stringifyToml,
  stringifyTomlKey,
  stringifyTomlLines,
  stringifyTomlValue,
  type TomlStringEntry,
} from "./toml.js";
export {
  deleteYamlEntry,
  managedYamlNames,
  parseYaml,
  readYamlEntry,
  setYamlEntry,
  setYamlScalar,
} from "./yaml.js";

// Transient backup for native rewrites
export {
  createTransientFileBackup,
  removeTransientFileBackup,
  runWithTransientFileBackup,
  TransientBackupFailed,
  type TransientFileBackup,
} from "./transient-backup.js";
