/**
 * @agentxm/registry-client public API.
 *
 * The registry integration: local and remote registry clients over the
 * generated OpenAPI transport, request policy and retry, the typed registry
 * failure vocabulary with problem-details translation, the content-addressed
 * archive cache, lifecycle administration, and package-discovery results.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Client types and factory
export type {
  RegistryClient,
  RegistryExtensionManifest,
  GetExtensionsByOwnerArgs,
  GetExtensionsByOwnerResponse,
  GetExtensionIndexArgs,
  GetExtensionPackageArgs,
  PublishExtensionArgs,
  PublishExtensionResponse,
  RegistryPublishWarning,
} from "./client.js";

export { RegistryRetryObservation } from "./request-policy.js";
export {
  OperationExtractionBudget,
  makeOperationExtractionBudget,
  type OperationExtractionBudgetService,
} from "./extraction-budget.js";
export {
  MAX_OPERATION_BUFFERED_ARCHIVE_BYTES,
  OperationBufferedArchiveBudget,
  makeOperationBufferedArchiveBudget,
  withBufferedArchiveBudget,
} from "./buffered-archive-budget.js";

export { makeUserArchiveCache } from "./archive-cache.js";

export type {
  RegistryExtensionReference,
  RegistryExtensionVersionReference,
  // Dependents infer the lifecycle client's type, so declaration emit must be
  // able to name it and its inputs; knip skips exports tagged public.
  /** @public */
  RegistryLifecycleClient,
  /** @public */
  PutExtensionDeprecationInput,
  /** @public */
  PutExtensionArchivalInput,
  YankCategory,
} from "./admin-client.js";

// Failure vocabulary
export {
  REGISTRY_ERROR_CATEGORIES,
  RegistryOperationFailed,
  RegistryOperationUnsupported,
  RegistryProblem,
  RegistryRequestFailed,
  isRegistryClientFailure,
  withRegistrySemantics,
  type RegistryClientFailure,
  type RegistryErrorCategory,
  type RegistryErrorMetadata,
} from "./errors.js";

// Failure translation
export { registryErrorToProblem } from "./translate.js";
export { captureRegistryErrorResponseBodies, mapRegistryFailure } from "./failure-mapping.js";
export { retainedRegistryResponseBody } from "./response-body.js";

// Error mapping helpers
export {
  getString,
  isRegistryClientError,
  isHttpClientError,
  isSchemaError,
  isTransientRegistryError,
} from "./error-mapping.js";

// Utilities
export { extensionLifecycleWarnings } from "./utils.js";
export { formatDeprecationWarning } from "./deprecation-warning.js";

export {
  makeRegistryClientFactory,
  RegistryClientFactory,
  RegistryClientFactoryLive,
  type RegistryClientFactoryService,
} from "./registry-client-factory.js";
export { requireHttpRegistryEndpoint } from "./capabilities.js";
export {
  RegistryHttpClient,
  RegistryRequestAuthorization,
  refuseRegistryRedirects,
  registryWire,
} from "./registry-transport.js";
export {
  RegistryContext,
  RegistrySelectionFailed,
  RegistrySourceUnknown,
  type BoundRegistry,
  type RegistryContextService,
  type RegistrySelectionFailure,
  type RegistrySelectionReason,
} from "./registry-context.js";

// Discovery results refined from the generated transport
export {
  DiscoveryResolvedExtensionSchema,
  type DiscoverPackagesResponse,
  type DiscoveryExtensionResult,
  type DiscoveryResolvedExtension,
} from "./discovery-response.js";

// Generated OpenAPI transport (consumed by the Registry access capability)
export * as GeneratedRegistryClient from "./__generated__/registry-client.js";

export {
  collectBufferedArchive,
  MAX_ARCHIVE_ENTRIES,
  MAX_BUFFERED_ARCHIVE_BYTES,
  MAX_EXTRACTED_ARCHIVE_BYTES,
} from "./archive-limits.js";

export { RegistryFailureObservation } from "./failure-observation.js";
