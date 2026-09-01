/**
 * Workspace-sync feature: destructive reconciliation of AXM-managed
 * artifacts on agent surfaces with the desired workspace state.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export {
  cleanupManagedArtifactsForRemovedAgents,
  cleanupStaleManagedSkillDirectories,
  cleanupStaleManagedSubagentFiles,
  inspectWorkspaceOwnership,
  type RemovedAgentArtifactCleanupResult,
  type RenderedFileCleanupResult,
} from "./rendered-file-cleanup.js";
