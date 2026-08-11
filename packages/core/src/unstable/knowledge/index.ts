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
  KNOWLEDGE_DIAGNOSTIC_CODES,
  openKnowledgeConcept,
  searchKnowledgeConcepts,
  type KnowledgeBundleEntry,
  type KnowledgeConcept,
  type KnowledgeDiagnostic,
  type KnowledgeDiagnosticCode,
  type KnowledgeInspection,
} from "./okf.js";
export { inspectKnowledgePackage } from "./package-inspection.js";
export type {
  GitHostedKnowledgeRef,
  KnowledgeExtensionRef,
  LocalKnowledgeRef,
  RegistryKnowledgeRef,
  WorkspaceKnowledgeRef,
} from "./refs.js";
export { KnowledgeManager, KnowledgeManagerLive, type KnowledgeManagerService } from "./manager.js";
export {
  resolveKnowledgeDiscoveryConfig,
  type ResolvedKnowledgeDiscoveryConfig,
} from "./discovery-config.js";
export {
  KNOWLEDGE_MATERIALIZATION_STATE,
  reconcileKnowledgeDiscovery,
  type KnowledgeDiscoveryArtifact,
  type KnowledgeDiscoveryBundle,
  type KnowledgeDiscoveryResult,
} from "./discovery.js";
export { knowledgeReconciliationAdapter } from "./reconciliation-adapter.js";
