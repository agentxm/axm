/**
 * Extension-publish feature: publish selection policy, publication
 * validation, archive planning, authentication requirements, upload
 * settlement, and recovery. Authentication is expressed as typed
 * precondition data and consumed as structural grant values; the application
 * sequences the Registry access capability to satisfy it.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export { publishRefused } from "./errors.js";

export { PUBLISHABLE_TYPES, isPublishableType, type PublishableType } from "./publishable-types.js";

export { planZipArchive } from "./archive.js";

export { publishAuthenticationPreconditions } from "./authorization.js";

export { buildPublishJobs } from "./jobs.js";

export { publishRecoverySelection } from "./recovery.js";

export { findPackPublishDivergenceFindings, validatePublishOwners } from "./preflight.js";

// Typed publish failures and the redacted cause the result reports
export { publishCause } from "./failure.js";

// The publish result contract (`publish-result-v3`)
export {
  PublishResultSchema,
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
  selectableTypes,
  type PublishRequest,
} from "./publish/model.js";

// Settlement rules that keep an unconfirmed run from reading as a publication
// The declared visibility one publication carries
// The publish application API
export {
  PublishExtensions,
  prepare,
  previewOrApply,
  type PublishOutcome,
} from "./publish/use-case.js";

// Published-extension lifecycle: the honest Registry transition outcome
export {
  RegistryTransitionSchema,
  registryTransition,
  type RegistryTransition,
} from "./lifecycle/remote-outcome.js";
export { RetirePublishedVersion } from "./lifecycle/retirement.js";
export { ArchivePublishedExtension } from "./lifecycle/archival.js";
export { DeprecatePublishedExtension } from "./lifecycle/deprecation.js";
export { ManagePublishedVisibility } from "./lifecycle/visibility.js";
