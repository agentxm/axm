/**
 * @agentxm/workspace/resolution public API.
 *
 * Extension resolution policy: which source is allowed to supply a
 * configured extension, which visible version that source resolves to under
 * the minimum-release-age policy, which publisher binding a proposed
 * acceptance replaces, and how a Pack's declared members resolve. Pure over the
 * Registry index contract and workspace state; the provider that fetches the
 * index applies these through a port.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export {
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
  type HeldReleasePolicy,
  type ReleaseAgeBypassRecord,
  type ReleaseAgeHoldbackRecord,
  type ReleaseAgeOperationEvidence,
  type ReleaseAgeRecord,
  type ReleaseAgeRecordBase,
  type ReleaseAgeRecordSubject,
  filterMatureVersions,
  formatMinimumReleaseAgeSeconds,
  isVersionEntryEligibleAt,
  isVersionEntryMature,
  normalizeReleaseAgeRecords,
  parseMinimumReleaseAge,
  releaseAgeEvidence,
  releaseAgeExemptionForIdentity,
  releaseAgeHoldbackWarning,
  releaseAgeRecord,
  releaseAgeRecords,
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

export { type SourceBindingProposal } from "./source-switch.js";

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
  prepareConfiguredPack,
  prepareConfiguredRegistryEntry,
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
  resolvePackDependenciesWithReleaseAge,
  type PackDependencyRefResolver,
  type PackMemberRangeResolver,
  type ReleaseAgeAwarePackDependencyResolution,
  type ResolvedPackDependencies,
  type WorkspacePackDependencyResolution,
  type WorkspacePackDependencyResolver,
} from "./pack-dependency-resolution.js";
export { acceptedPackDependencyResolver } from "./accepted-pack-dependency-resolver.js";

// Official-skill byte inspection remains a workspace integration.
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

// Targeted update classification: who owns the declaration a named update
// would move, whether it may move, and the freshness witness apply rechecks.
export {
  classifyTargetedUpdate,
  resolveTargetedUpdateContext,
  type ClassifyTargetedUpdateArgs,
  type TargetedUpdateAuthority,
  type TargetedUpdateBlocker,
  type TargetedUpdateContext,
  type TargetedUpdateContextFailure,
  type TargetedUpdateEffect,
  type TargetedUpdateOwnership,
  type TargetedUpdatePublicContext,
  type TargetedUpdateTarget,
  type TargetedUpdateTargetType,
} from "./update/targeted-update-context.js";

// Which Packs hold the newest release of an updated extension back.
export { heldBackReleaseWarnings } from "./update/held-back-releases.js";
export { hydrateAcceptedPackRef } from "./accepted-pack-hydration.js";
