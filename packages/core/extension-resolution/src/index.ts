/**
 * @agentxm/extension-resolution public API.
 *
 * Extension resolution policy: the minimum-release-age policy (evaluation,
 * exemptions, evidence records), version selection under that policy, and
 * named Registry target decisions. Pure over the Registry index contract; the
 * provider that fetches the index applies these through a port.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export {
  DEFAULT_MINIMUM_RELEASE_AGE,
  DEFAULT_MINIMUM_RELEASE_AGE_DURATION,
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
