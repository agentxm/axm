/**
 * @agentxm/extension-resolution public API.
 *
 * Extension resolution policy: which source is allowed to supply a
 * configured extension, which visible version that source resolves to under
 * the minimum-release-age policy, which publisher binding a proposed
 * acceptance replaces, how a Pack's declared members resolve, and whether an
 * official AXM skill candidate is compatible with this CLI. Pure over the
 * Registry index contract and workspace state; the provider that fetches the
 * index applies these through a port.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export {
  AxmSkillCompatibilityUnavailable,
  AxmSkillIncompatible,
  ExtensionResolutionFailed,
  PackConstraintShadowed,
  PackDependencyConflict,
  PackDependencyInvalid,
  PackDependencyMissing,
  PackDependencyUnsatisfied,
  SourceAuthorityBlocked,
  type PackDependencyResolutionFailure,
} from "./errors.js";

export {
  type ReleaseAgeBypassRecord,
  type ReleaseAgeHoldbackRecord,
  type ReleaseAgeOperationEvidence,
  type ReleaseAgeRecord,
  type ReleaseAgeRecordBase,
  filterMatureVersions,
  formatMinimumReleaseAgeSeconds,
  isVersionEntryEligibleAt,
  isVersionEntryMature,
  normalizeReleaseAgeRecords,
  parseMinimumReleaseAge,
  releaseAgeEvidence,
  releaseAgeExemptionForIdentity,
  releaseAgeHoldbackWarning,
} from "./release-age-policy.js";
export {
  type ReleaseAgeVersionResolution,
  resolveVersionEntryForReleaseAge,
  resolveVersionEntryWithReleaseAge,
} from "./version-resolution.js";
export {
  decideNamedRegistryVersion,
  namedRegistryCandidates,
} from "./named-registry-resolution.js";

// The operator's posture for one invocation, and the bound on how long
// resolving one configured entry may take.
export { ReleaseAgePosture, type ReleaseAgePostureValue } from "./release-age-posture.js";
export {
  CONFIGURED_ENTRY_RESOLUTION_TIMEOUT,
  withConfiguredEntryResolutionTimeout,
} from "./resolution-timeout.js";

// Which source may supply a configured extension.
export {
  evaluateSourceAuthority,
  type SourceAuthorityBlockedCause,
  type SourceAuthorityBlockedFact,
  type SourceAuthorityDecision,
  type SourceAuthorityInput,
  type SourceAuthorityRelationship,
  type SourceAuthorityTarget,
  type WorkspaceAuthorityStatus,
} from "./source-authority.js";

// Configured-entry vocabulary and resolution.
export {
  type ConfiguredEntryFailureReason,
  type ConfiguredRegistryResolution,
  type ResolvedConfiguredEntry,
  type ResolvedConfiguredHook,
  type ResolvedConfiguredKnowledge,
  type ResolvedConfiguredMcpServer,
  type ResolvedConfiguredPack,
  type ResolvedConfiguredRule,
  type ResolvedConfiguredSkill,
  type ResolvedConfiguredSubagent,
} from "./configured-entry.js";
export {
  makeConfiguredReleaseAgeEvaluation,
  resolveConfiguredHook,
  resolveConfiguredKnowledge,
  resolveConfiguredMcpServer,
  resolveConfiguredPack,
  resolveConfiguredRegistryEntry,
  resolveConfiguredRule,
  resolveConfiguredSkill,
  resolveConfiguredSubagent,
} from "./configured-entry-resolution.js";

// Publisher binding trust classification.
export {
  classifyPublisherBindingTransition,
  describePublisherBindingTransition,
  publisherTransitionWarning,
  registryBindingProposal,
  type PublisherBindingTransition,
  type RegistryBindingProposal,
} from "./publisher-binding.js";

// Pack dependency resolution.
export {
  ResolvedPackDependencyMapSchema,
  ResolvedPackDependencySchema,
  type ResolvedPackDependency,
  type ResolvedPackDependencyMap,
} from "./resolved-pack-dependency.js";
export {
  resolvePackDependencies,
  resolvePackDependenciesWithReleaseAge,
  type PackDependencyRefResolver,
  type ReleaseAgeAwarePackDependencyResolution,
  type ResolvedPackDependencies,
  type WorkspacePackDependencyResolution,
  type WorkspacePackDependencyResolver,
} from "./pack-dependency-resolution.js";
export { acceptedPackDependencyResolver } from "./accepted-pack-dependency-resolver.js";

// Official AXM skill compatibility policy.
export {
  AXM_SKILL_BUNDLED_APPLY_COMMAND,
  AXM_SKILL_BUNDLED_PREVIEW_COMMAND,
  AXM_SKILL_CLI_VERSION_METADATA_KEY,
  AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY,
  AXM_SKILL_FQN,
  AXM_SKILL_REGISTRY_APPLY_COMMAND,
  AXM_SKILL_REGISTRY_PREVIEW_COMMAND,
  AxmSkillCompatibilityPolicy,
  AxmSkillCompatibilityRecoveryActionSchema,
  AxmSkillCompatibilityRecoverySchema,
  AxmSkillCompatibilityRecoveryStepSchema,
  AxmSkillCompatibilityReasonSchema,
  AxmSkillCompatibilitySchema,
  evaluateAxmSkillCompatibility,
  formatAxmSkillCompatibilityTarget,
  makeAxmSkillCompatibilityPolicyLayer,
  validateAxmSkillCliVersionRange,
  type AxmSkillCliVersionRangeValidation,
  type AxmSkillCompatibility,
  type AxmSkillCompatibilityCandidate,
  type AxmSkillCompatibilityInput,
  type AxmSkillCompatibilityPolicyInput,
  type AxmSkillCompatibilityPolicyService,
  type AxmSkillCompatibilityReason,
  type AxmSkillCompatibilityRecovery,
  type AxmSkillCompatibilityRecoveryAction,
  type AxmSkillCompatibilityRecoveryStep,
} from "./axm-skill-compatibility.js";
export {
  evaluateAxmSkillCandidate,
  validateAxmSkillCandidate,
  type ValidateAxmSkillCandidateArgs,
} from "./axm-skill-candidate.js";
export {
  declaresOfficialAxmSkill,
  readAxmSkillWorkspaceCompatibility,
  type ReadAxmSkillWorkspaceCompatibilityArgs,
} from "./axm-skill-workspace-compatibility.js";
