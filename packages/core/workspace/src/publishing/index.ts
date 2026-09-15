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
  isArchivePathIncluded,
  planZipArchive,
  type ArchivePlan,
  type ArchivePlanFile,
  type ArchivePlanPattern,
  type BuildZipArchiveOptions,
  type PlannedZipArchive,
} from "./archive.js";

export {
  assessPublishSourceState,
  publishSourceRiskCondition,
  type PublishSourceAssessment,
  type PublishSourceDifference,
  type PublishSourceState,
} from "./source-state.js";

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

// Typed publish failures and the redacted cause the result reports
export {
  aggregatePublishFailure,
  isPublishFailure,
  isRetryablePublishFailure,
  publishCause,
  publishFailureCategory,
  publishFailureDetail,
  publishFailureProblemCode,
  publishFailureSuggestions,
  type PublishCauseClass,
  type PublishFailure,
} from "./failure.js";

// The publish result contract (`publish-result-v3`)
export {
  PublishAdvisoryFindingSchema,
  PublishResultSchema,
  classifyPublishResults,
  executionStatus,
  normalizePublishResult,
  type PublishPublicationSet,
  type PublishResult,
  type PublishResultInput,
  type PublishResultItem,
  type PublishSelectionDecision,
} from "./publish/result.js";

// Publish selection policy and candidate model
export {
  normalizeTypePublishSelection,
  onExistingPolicies,
  resolveExistingVersionPolicy,
  selectableTypes,
  type OnExistingPolicy,
  type PublishCandidate,
  type PublishRequest,
  type PublishSelectionMode,
} from "./publish/model.js";

// Settlement rules that keep an unconfirmed run from reading as a publication
export { interruptedPublishResults, unconfirmedPublishOutcomes } from "./publish/outcome.js";

// The declared visibility one publication carries
export { declaredVisibilityIntent } from "./publish/publication.js";

// The publish application API
export {
  PublishExtensions,
  prepare,
  previewOrApply,
  type PublishCandidateSet,
  type PublishDisposition,
  type PublishOutcome,
  type PublishPreparation,
  type PublishSelectionSummary,
} from "./publish/use-case.js";

// Published-extension lifecycle: the honest Registry transition outcome
export {
  REGISTRY_TRANSITION_CONTRACT,
  RegistryTransitionSchema,
  registryTransition,
  type RegistryTransition,
  type RegistryTransitionAction,
} from "./lifecycle/remote-outcome.js";
export {
  RetirePublishedVersion,
  parseExactVersionReference,
  parseExtensionReference,
  unyank,
  yank,
  type YankRequest,
} from "./lifecycle/retirement.js";
export {
  DeprecatePublishedExtension,
  deprecate,
  undeprecate,
  type DeprecationEdit,
} from "./lifecycle/deprecation.js";
export {
  ManagePublishedVisibility,
  parseVisibilityTarget,
  repositoryVisibilityIntent,
  type VisibilitySetRequest,
  type VisibilityTarget,
  type VisibilityWriteRequest,
} from "./lifecycle/visibility.js";
