/**
 * Extension-publish feature: publish selection policy, publication
 * validation, archive planning, authentication requirements, upload
 * settlement, and recovery. Authentication is expressed as typed
 * precondition data and consumed as structural grant values; the application
 * sequences the registry-auth feature to satisfy it.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export { PublishFailed } from "./errors.js";

export { PUBLISHABLE_TYPES, isPublishableType, type PublishableType } from "./publishable-types.js";

export { runPublishLintGate, type PublishLintArgs } from "./lint-gate.js";
export {
  PublishIgnoreError,
  protectedPublishPaths,
  publishArchiveOptions,
  resolvePublishIgnore,
} from "./publish-ignore.js";

export {
  buildZipArchive,
  planZipArchive,
  type ArchivePlan,
  type ArchivePlanFile,
  type ArchivePlanPattern,
  type BuildZipArchiveOptions,
  type PlannedZipArchive,
} from "./archive.js";

export {
  settlePublish,
  type PublishSettlement,
  type PublishSettlementFailure,
  type SettledPublish,
} from "./settlement.js";

export {
  exactPublishUploadBinding,
  previewPublishUploadBinding,
  publishAuthenticationPreconditions,
  type PublishGrant,
  type ResolvedPublishPreview,
} from "./authorization.js";

export { buildPublishJobs, type PublishPlanCandidate } from "./jobs.js";

export { publishRecoverySelection, type PublishRecoveryItem } from "./recovery.js";

export {
  alreadyPublishedVersionConflict,
  findPackPublishDivergenceFindings,
  localPackConstraintFailures,
  nonMonotonicVersionConflict,
  validatePublishOwners,
  type LocalPackConstraintCandidate,
  type PublishAdvisoryFinding,
  type PublishAdvisorySuggestion,
} from "./preflight.js";
