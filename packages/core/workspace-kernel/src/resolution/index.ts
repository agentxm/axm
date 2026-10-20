/**
 * @agentxm/workspace-kernel/resolution public API.
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
  AcceptedPackMemberIncompatible,
  PackDependencyMissing,
  PackDependencyUnsatisfied,
  SourceAuthorityBlocked,
  type PackDependencyResolutionFailure,
} from "./errors.js";

export {
  type HeldReleasePolicy,
  formatMinimumReleaseAgeSeconds,
  isVersionEntryEligibleAt,
  normalizeReleaseAgeRecords,
  parseMinimumReleaseAge,
  releaseAgeExemptionForIdentity,
  releaseAgeRecord,
  releaseAgeRecords,
} from "./release-age-policy.js";
// The operator's posture for one invocation.
export { ReleaseAgePosture, type ReleaseAgePostureValue } from "./release-age-posture.js";

// Which source may supply a configured extension.
export { evaluateSourceAuthority, type SourceAuthorityBlockedFact } from "./source-authority.js";

// Configured-entry vocabulary and resolution.
export { type ResolvedConfiguredEntry } from "./configured-entry.js";
export {
  makeConfiguredReleaseAgeEvaluation,
  settleRegistryResolution,
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
} from "./publisher-binding.js";

// Pack dependency resolution.
export {
  resolvePackDependenciesWithReleaseAge,
  type PackDependencyRefResolver,
  type PackMemberRangeResolver,
  type ReleaseAgeAwarePackDependencyResolution,
  type WorkspacePackDependencyResolver,
} from "./pack-dependency-resolution.js";
export { acceptedPackDependencyResolver } from "./accepted-pack-dependency-resolver.js";
export { acceptedConfiguredResolution } from "./accepted-configured-entry.js";
export { requireAcceptedRegistryContent } from "./accepted-registry-content.js";

// Official-skill byte inspection remains a workspace integration.
export { validateAxmSkillCandidate } from "./axm-skill-candidate.js";
export {
  assessOfficialAxmSkill,
  selectOfficialAxmSkill,
  type OfficialAxmSkillAssessment,
} from "./axm-skill-workspace-compatibility.js";

// Targeted update classification: who owns the declaration a named update
// would move, whether it may move, and the freshness witness apply rechecks.
export {
  resolveTargetedUpdateContext,
  type TargetedUpdateBlocker,
  type TargetedUpdateContext,
  type TargetedUpdateContextFailure,
  type TargetedUpdatePublicContext,
} from "./update/targeted-update-context.js";

// Which Packs hold the newest release of an updated extension back.
export { heldBackReleaseWarnings } from "./update/held-back-releases.js";

// The deprecation and lifecycle notices a registry ref carries.
export { extensionRefLifecycleWarnings } from "./lifecycle-warnings.js";
