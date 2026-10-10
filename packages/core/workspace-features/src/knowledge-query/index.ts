export {
  relatedKnowledgeConcepts,
  resolveKnowledgeConcept,
  type KnowledgeRelatedConcept,
  type KnowledgeRelation,
  type KnowledgeResolveCandidate,
  type KnowledgeResolveResult,
} from "./knowledge-graph.js";
export {
  projectKnowledgeConcepts,
  resolveKnowledgeFrontmatterPointer,
  type KnowledgeBacklink,
  type KnowledgeBodyPassage,
  type KnowledgeFrontmatterPointerResult,
  type KnowledgeOutgoingLink,
  type KnowledgeProjectedConcept,
  type KnowledgeSearchableField,
  type KnowledgeSearchableUnit,
} from "./knowledge-projection.js";
export {
  captureKnowledgeCorpus,
  computeKnowledgeCorpusFingerprint,
  computeKnowledgeProjectionRevision,
  computeKnowledgeSourceRevision,
  KnowledgeCorpusChangingError,
  type CapturedKnowledgeCorpus,
  type CapturedKnowledgeSource,
  type KnowledgeCorpusSource,
} from "./knowledge-revision.js";
export {
  KNOWLEDGE_DISCOVERY_CAPABILITIES,
  KNOWLEDGE_DISCOVERY_CAPABILITIES_CONTRACT_ID,
  KnowledgeDiscoveryCapabilitiesSchema,
  type KnowledgeDiscoveryCapabilities,
} from "./knowledge-capabilities.js";
export {
  knowledgeQueryIdentity,
  KnowledgeQueryClauseSchema,
  KnowledgeQuerySchema,
  KnowledgeTextClauseSchema,
  makeKnowledgeQuery,
  KNOWLEDGE_DISCOVERY_OPERATIONS,
  KNOWLEDGE_LIFECYCLE_FILTER_FIELDS,
  KNOWLEDGE_METADATA_FILTER_FIELDS,
  KNOWLEDGE_QUERY_CONTRACT_ID,
  KNOWLEDGE_QUERY_OPERATORS,
  KNOWLEDGE_SEARCHABLE_FIELDS,
  type KnowledgeQuery,
  type KnowledgeQueryClause,
  type KnowledgeTextClause,
} from "./knowledge-query.js";
export {
  getKnowledgeIndexConcept,
  KnowledgeCursorInvalidError,
  KnowledgeIndex,
  makeKnowledgeIndexSnapshot,
  queryKnowledgeIndex,
  queryKnowledgeIndexResult,
  type KnowledgeConceptResult,
  type KnowledgeCursorInvalidReason,
  type KnowledgeIndexBundleInput,
  type KnowledgeIndexedConcept,
  type KnowledgeIndexService,
  type KnowledgeIndexSnapshot,
  type KnowledgeMatchSpan,
  type KnowledgeQueryPage,
  type KnowledgeResultPassage,
} from "./knowledge-index.js";
export {
  captureKnowledgeIndexBundles,
  KnowledgeCapturedSourceMissingError,
  type KnowledgeBundleCaptureDescriptor,
} from "./knowledge-capture.js";

// Typed failures, outcome documents, and the read-only application API.
export {
  KnowledgeConceptNotFound,
  KnowledgeCorpusUnavailable,
  KnowledgeRequestInvalid,
} from "./errors.js";
export {
  FrontmatterDocumentSchema,
  KnowledgeConceptCorpusChangingFailureSchema,
  KnowledgeConceptCursorFailureSchema,
  KnowledgeConceptGetOutputSchema,
  KnowledgeConceptQueryPageSchema,
  KnowledgeConceptRelatedOutputSchema,
  KnowledgeConceptResolveOutputSchema,
  KnowledgeConceptResultSchema,
  KnowledgeConceptCapabilitiesOutputSchema,
  KnowledgeLintQueryResultSchema,
  type KnowledgeConceptGetOutput,
  type KnowledgeConceptQueryPage,
  type KnowledgeConceptRelatedOutput,
  type KnowledgeConceptResolveOutput,
  type KnowledgeConceptCapabilitiesOutput,
  type KnowledgeLintQueryResult,
} from "./documents.js";
export {
  captureInstalledKnowledgeCorpus,
  type CapturedInstalledBundle,
  type InstalledKnowledgeCorpus,
} from "./corpus/installed-corpus.js";
export { reportKnowledgeDiscoveryCapabilities } from "./corpus/corpus-capabilities.js";
export {
  lintKnowledge,
  type LintKnowledgeRequest,
  type LintKnowledgeResult,
} from "./lint/lint-knowledge.js";
export {
  checkTraversalDepth,
  makeKnowledgeQueryRequest,
  type KnowledgeQueryRequest,
} from "./query/request.js";
export { KnowledgeDiscovery } from "./knowledge-discovery.js";
