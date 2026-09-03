/**
 * Area barrel for the shared executable-specification contract.
 *
 * @experimental This API is unstable and may change without notice.
 */

export {
  type BoundEvidenceGate,
  EXECUTION_BOUNDARIES,
  EXECUTION_SELECTIONS,
  type ExecutionBinding,
  type ExecutionBoundary,
  type ExecutionSelection,
  IDENTITY_SEGMENT_PATTERN,
  KNOWN_QUALITY_CHARACTERISTICS,
  KNOWN_SPECIFICATION_METHODS,
  type KnownQualityCharacteristic,
  type KnownSpecificationMethod,
  type ProductGoalDefinition,
  type ProductGoalRegistry,
  SPECIFICATION_CLASSES,
  SPECIFICATION_ROLES,
  SPECIFICATION_STATUSES,
  type SpecificationClass,
  type SpecificationLimitation,
  type SpecificationMetadata,
  type SpecificationRole,
  type SpecificationStatus,
  UNVERIFIABLE_SPECIFICATION_METHODS,
  defineBoundEvidence,
  defineExecutionBinding,
  defineProductGoals,
  defineSpecification,
} from "./contract.js";
export {
  BoundEvidenceSchema,
  ExecutionBindingSchema,
  ProductGoalRegistrySchema,
  SpecificationMetadataSchema,
  decodeBoundEvidence,
  decodeExecutionBinding,
  decodeProductGoalRegistry,
  decodeSpecificationMetadata,
  type DecodeResult,
} from "./decode.js";
export {
  type ConformanceIssue,
  type CorpusExecutionBinding,
  type CorpusInput,
  type CorpusSpecification,
  checkSpecificationCorpus,
  isExecutableMethodSet,
  lintProductLanguage,
} from "./conformance.js";
export { type SharedProductGoalId, sharedProductGoals } from "./shared-goals.js";
