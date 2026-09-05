/**
 * Area barrel for the package public surface.
 *
 * @experimental This API is unstable and may change without notice.
 */

export {
  type ConceptRef,
  type ConceptRefFormat,
  ConceptRefInvalidError,
  ConceptRefSchema,
  type KnowledgeBundleFqn,
  KnowledgeBundleFqnSchema,
  type KnowledgeConceptId,
  KnowledgeConceptIdSchema,
  type KnowledgeRevision,
  KnowledgeRevisionSchema,
  type ResolvedConceptRef,
  ResolvedConceptRefSchema,
  formatConceptRef,
  parseConceptRef,
} from "./concept-ref.js";
export {
  KNOWLEDGE_EXTENSION_DIR,
  KNOWLEDGE_MANIFEST_FILENAME,
  KNOWLEDGE_MANIFEST_SCHEMA_URL,
  KNOWLEDGE_SOURCE_DIR,
  type KnowledgeManifest,
  KnowledgeManifestSchema,
} from "./manifest-schema.js";
