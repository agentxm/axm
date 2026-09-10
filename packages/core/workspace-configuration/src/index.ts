/**
 * Workspace-configuration feature: workspace initialization and setup flows,
 * configured-agent membership policy, instruction-management policy over the
 * kernel's instruction semantics, and inline workspace MCP capability policy.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export { WorkspaceConfigurationFailed } from "./errors.js";

export {
  bootstrapWorkspace,
  initializeProjectWorkspace,
  ensureUserWorkspaceInitialized,
  ensureProjectWorkspaceInitialized,
  type SetupAgentCandidate,
} from "./initialization.js";

export type {
  InstructionSourceChoice,
  SetupAgentScan,
  SetupPlanRow,
  WorkspaceInitializationInteractionService,
} from "./initialization-interaction.js";
export {
  WorkspaceInitializationCancelled,
  WorkspaceInitializationInteraction,
} from "./initialization-interaction.js";

export {
  activeInstructionsConfig,
  disableInstructionManagement,
  instructionReconciliationReadiness,
  instructionStateIsCurrent,
  observeInstructions,
  reconcileInstructionTransition,
  removeInstructionTargetsFor,
  type InstructionReadinessFailure,
} from "./instruction-reconciliation.js";

export { dedupe, makeAtomicMembershipSteps, validateAgentIds } from "./membership.js";

export {
  makeInlineMcpDefinition,
  matchesInlineMcpEntry,
  parseInlineMcpEnv,
  parseInlineMcpHeaders,
  splitCommand,
  validateInlineMcpRemoteUrl,
} from "./inline-mcp.js";

export {
  preflightMcpImports,
  type InlineMcpDefinition,
  type McpImportAdoption,
  type McpImportCandidate,
  type McpImportFinding,
  type McpImportPreflight,
  type McpImportSource,
} from "./mcp-import-preflight.js";

export { applyMcpImport, collectMcpImportSources, removeConvertedMcpConfig } from "./mcp-import.js";
