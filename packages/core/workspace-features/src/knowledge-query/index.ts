export {
  KNOWLEDGE_DISCOVERY_OPERATIONS,
  KNOWLEDGE_QUERY_OPERATORS,
  KNOWLEDGE_SEARCHABLE_FIELDS,
} from "./knowledge-query.js";
// Typed failures, outcome documents, and the read-only application API.
export {
  KnowledgeConceptNotFound,
  KnowledgeCorpusUnavailable,
  KnowledgeRequestInvalid,
} from "./errors.js";
export {
  KnowledgeConceptCorpusChangingFailureSchema,
  KnowledgeConceptCursorFailureSchema,
  KnowledgeConceptGetOutputSchema,
  KnowledgeConceptQueryPageSchema,
  KnowledgeConceptRelatedOutputSchema,
  KnowledgeConceptResolveOutputSchema,
  KnowledgeConceptCapabilitiesOutputSchema,
  KnowledgeLintQueryResultSchema,
} from "./documents.js";
export { reportKnowledgeDiscoveryCapabilities } from "./corpus/corpus-capabilities.js";
export { lintKnowledge } from "./lint/lint-knowledge.js";
export { KnowledgeDiscovery } from "./knowledge-discovery.js";

// Dependents' inferred types name these, so their declaration emit must be
// able to; knip skips exports tagged public.
/** @public */
export { KnowledgeIndex } from "./knowledge-index.js";
