export {
  KNOWLEDGE_EXTENSION_DIR,
  KNOWLEDGE_MANIFEST_FILENAME,
  KNOWLEDGE_MANIFEST_SCHEMA_URL,
  KNOWLEDGE_SOURCE_DIR,
  KnowledgeManifestSchema,
  type KnowledgeManifest,
} from "./manifest-schema.js";
export {
  inspectKnowledgeBundle,
  inspectKnowledgeEntries,
  openKnowledgeConcept,
  searchKnowledgeConcepts,
  type KnowledgeBundleEntry,
  type KnowledgeConcept,
  type KnowledgeDiagnostic,
  type KnowledgeInspection,
} from "./okf.js";
export type {
  GitHostedKnowledgeRef,
  KnowledgeExtensionRef,
  LocalKnowledgeRef,
  RegistryKnowledgeRef,
  WorkspaceKnowledgeRef,
} from "./refs.js";
export { KnowledgeManager, KnowledgeManagerLive, type KnowledgeManagerService } from "./manager.js";
export {
  DEFAULT_KNOWLEDGE_DIRECTORY,
  resolveKnowledgeProjectionConfig,
  type ResolvedKnowledgeProjectionConfig,
} from "./projection-config.js";
export {
  KNOWLEDGE_MATERIALIZATION_STATE,
  reconcileKnowledgeProjection,
  type KnowledgeProjectionArtifact,
  type KnowledgeProjectionBundle,
  type KnowledgeProjectionResult,
} from "./projection.js";
export { knowledgeReconciliationAdapter } from "./reconciliation-adapter.js";
