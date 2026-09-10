/**
 * Area barrel for the package public surface.
 *
 * @experimental This API is unstable and may change without notice.
 */

export {
  ArchiveGuardrailError,
  type ArchiveGuardrailLimits,
  type ZipEntry,
  checkForbiddenSourceEntries,
  validateArchive,
} from "./archive-guardrails.js";
export {
  FilteredPackageError,
  type ValidateFilteredPackageArgs,
  validateFilteredPackage,
} from "./filtered-package-validation.js";
export {
  IngestLimitError,
  IngestUnsupportedContentTypeError,
  REGISTRY_PUBLISH_MAX_ARCHIVE_BYTES,
  REGISTRY_PUBLISH_MAX_REQUEST_BYTES,
  enforceArchiveContentType,
  enforceArchiveSizeLimit,
  enforceRequestSizeLimit,
} from "./ingest-limits.js";
export {
  type NormalizePublishInputArgs,
  type PublishArchiveInput,
  type PublishInput,
  normalizePublishInput,
} from "./input-normalization.js";
export {
  type DeclaredPublishIdentity,
  ManifestError,
  type ManifestIdentity,
  ManifestIdentitySchema,
  type ResolvedManifest,
  manifestFilenameForType,
  validateDeclaredManifestAlignment,
} from "./manifest-policy.js";
export {
  type PublishVisibility,
  PublishVisibilitySchema,
  type ResolveVisibilityIntentArgs,
  type VisibilityActual,
  VisibilityActualSchema,
  type VisibilityComparison,
  VisibilityComparisonSchema,
  type VisibilityEvaluation,
  type VisibilityEvaluationResult,
  VisibilityEvaluationResultSchema,
  VisibilityEvaluationSchema,
  type VisibilityEvaluationUnavailable,
  VisibilityEvaluationUnavailableSchema,
  type VisibilityFinding,
  type VisibilityFindingCode,
  VisibilityFindingCodeSchema,
  VisibilityFindingSchema,
  type VisibilityFingerprint,
  VisibilityFingerprintSchema,
  type VisibilityIntent,
  VisibilityIntentSchema,
  type VisibilityIntentSource,
  type VisibilityMutationAuthority,
  VisibilityMutationAuthoritySchema,
  type VisibilityMutationRequest,
  VisibilityMutationRequestSchema,
  type VisibilityMutationResult,
  VisibilityMutationResultSchema,
  type VisibilityRevision,
  VisibilityRevisionSchema,
  resolveVisibilityIntent,
} from "./visibility.js";
