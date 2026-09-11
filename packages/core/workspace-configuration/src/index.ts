/**
 * Workspace-configuration feature: setting up a workspace, deciding which
 * coding agents it configures, managing instruction-file propagation, and
 * defining MCP servers inline in the workspace's own settings.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export { WorkspaceConfigurationFailed, configurationFailedToStepFailure } from "./errors.js";

// -----------------------------------------------------------------------------
// Setup
// -----------------------------------------------------------------------------

export {
  bootstrapWorkspace,
  initializeProjectWorkspace,
  ensureUserWorkspaceInitialized,
  ensureProjectWorkspaceInitialized,
  type SetupAgentCandidate,
} from "./setup/initialization.js";

export type {
  InstructionSourceChoice,
  SetupAgentScan,
  SetupPlanRow,
  WorkspaceInitializationInteractionService,
} from "./setup/initialization-interaction.js";
export {
  WorkspaceInitializationCancelled,
  WorkspaceInitializationInteraction,
} from "./setup/initialization-interaction.js";

export {
  SetupOutcomeSchema,
  SetupWorkspace,
  prepareSetupWorkspace,
  previewOrApplySetupWorkspace,
  previewAgentDefault,
  reportSetupWorkspace,
  type BundledSkillReport,
  type SetupApprovalRequired,
  type SetupArtifactTarget,
  type SetupOutcome,
  type SetupPlanStep,
  type SetupReportFailure,
  type SetupReportRequest,
  type SetupTransition,
  type SetupWorkspaceCandidate,
  type SetupWorkspaceFailure,
  type SetupWorkspaceRequest,
} from "./setup/setup-workspace.js";

// -----------------------------------------------------------------------------
// Configured-agent membership
// -----------------------------------------------------------------------------

export {
  agentLifecycle,
  isCatalogAgentId,
  isRetiredAgent,
  lifecycleWarning,
} from "./membership/agent-lifecycle.js";
export { dedupe, validateAgentIds } from "./membership/validate-agent-ids.js";
export {
  ConfigureAgents,
  ConfiguredAgentInventorySchema,
  listConfiguredAgents,
  prepareAddConfiguredAgents,
  prepareRemoveConfiguredAgents,
  previewOrApplyAddConfiguredAgents,
  previewOrApplyRemoveConfiguredAgents,
  type AddConfiguredAgentsCandidate,
  type AddConfiguredAgentsRequest,
  type ConfigureAgentsFailure,
  type ConfiguredAgentInventory,
  type ConfiguredAgentRow,
  type ConfiguredAgentsUnchanged,
  type DepartingAgentReconciliation,
  type ListConfiguredAgentsRequest,
  type MembershipExecutionRequirements,
  type MembershipReconciliation,
  type RemoveConfiguredAgentsCandidate,
  type RemoveConfiguredAgentsRequest,
} from "./membership/configure-agents.js";

// -----------------------------------------------------------------------------
// Instruction-file management
// -----------------------------------------------------------------------------

export {
  InstructionsStatusSchema,
  ManageInstructions,
  instructionsStatus,
  prepareManageInstructions,
  previewOrApplyManageInstructions,
  type InstructionsStatus,
  type InstructionsUnchanged,
  type ManageInstructionsCandidate,
  type ManageInstructionsRequest,
  type ManageInstructionsRequirements,
} from "./instructions/manage-instructions.js";

// -----------------------------------------------------------------------------
// Inline MCP servers
// -----------------------------------------------------------------------------

export {
  makeInlineMcpDefinition,
  matchesInlineMcpEntry,
  parseInlineMcpEnv,
  parseInlineMcpHeaders,
  splitCommand,
  validateInlineMcpRemoteUrl,
} from "./inline-mcp/definition.js";
export {
  AddInlineMcpServer,
  prepareAddInlineMcpServer,
  previewOrApplyAddInlineMcpServer,
  type AddInlineMcpServerCandidate,
  type AddInlineMcpServerRequest,
  type AddInlineMcpServerRequirements,
  type InlineMcpServerUnchanged,
} from "./inline-mcp/add-inline-mcp-server.js";

export {
  preflightMcpImports,
  type InlineMcpDefinition,
  type McpImportAdoption,
  type McpImportCandidate,
  type McpImportFinding,
  type McpImportPreflight,
  type McpImportSource,
} from "./mcp-import/preflight.js";
export { applyMcpImport, collectMcpImportSources } from "./mcp-import/apply.js";
export {
  ImportMcpServers,
  prepareImportMcpServers,
  previewOrApplyImportMcpServers,
  type ImportMcpServersCandidate,
  type ImportMcpServersRequirements,
} from "./mcp-import/import-mcp-servers.js";
