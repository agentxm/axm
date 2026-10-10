/**
 * Workspace-configuration feature: setting up a workspace, deciding which
 * coding agents it configures, managing instruction-file propagation, and
 * defining MCP servers inline in the workspace's own settings.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export {
  WorkspaceConfigurationFailed,
  configurationFailureToStepFailure,
  isConfigurationFamilyFailure,
  type ConfigurationFamilyFailure,
} from "./errors.js";

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
  SetupPlanDetail,
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
  AdoptInstructionRegion,
  prepareAdoptInstructionRegion,
  type AdoptableInstructionRegion,
} from "./instructions/adopt-instruction-region.js";

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
  preflightMcpAdoptions,
  type InlineMcpDefinition,
  type McpNativeAdoption,
  type McpAdoptionCandidate,
  type McpAdoptionFinding,
  type McpAdoptionPreflight,
  type McpNativeSource,
} from "./mcp-adoption/preflight.js";
export { applyMcpAdoption, collectMcpNativeSources } from "./mcp-adoption/apply.js";
export {
  AdoptMcpServers,
  prepareAdoptMcpServers,
  previewOrApplyAdoptMcpServers,
  type AdoptMcpServersCandidate,
  type AdoptMcpServersRequirements,
} from "./mcp-adoption/adopt-mcp-servers.js";

export { ConfigureHook, prepareConfigureHook } from "./hooks/configure-hook.js";
