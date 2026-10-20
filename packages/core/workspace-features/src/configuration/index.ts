/**
 * Workspace-configuration feature: setting up a workspace, deciding which
 * coding agents it configures, managing instruction-file propagation, and
 * defining MCP servers inline in the workspace's own settings.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export { configurationRefused } from "./errors.js";

// -----------------------------------------------------------------------------
// Setup
// -----------------------------------------------------------------------------

export { bootstrapWorkspace, undetectedAgentOffer } from "./setup/initialization.js";

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
  type SetupArtifactTarget,
  type SetupOutcome,
} from "./setup/setup-workspace.js";

// -----------------------------------------------------------------------------
// Configured-agent membership
// -----------------------------------------------------------------------------

export { agentLifecycle, isCatalogAgentId } from "./membership/agent-lifecycle.js";
export { validateAgentIds } from "./membership/validate-agent-ids.js";
export {
  ConfigureAgents,
  ConfiguredAgentInventorySchema,
  type ConfiguredAgentInventory,
} from "./membership/configure-agents.js";

// -----------------------------------------------------------------------------
// Instruction-file management
// -----------------------------------------------------------------------------

export { AdoptInstructionRegion } from "./instructions/adopt-instruction-region.js";

export {
  InstructionsStatusSchema,
  ManageInstructions,
  type InstructionsStatus,
} from "./instructions/manage-instructions.js";

// -----------------------------------------------------------------------------
// Inline MCP servers
// -----------------------------------------------------------------------------

export { AddInlineMcpServer } from "./inline-mcp/add-inline-mcp-server.js";

export {
  preflightMcpAdoptions,
  type McpAdoptionPreflight,
  type McpNativeSource,
} from "./mcp-adoption/preflight.js";
export { AdoptMcpServers } from "./mcp-adoption/adopt-mcp-servers.js";

export { ConfigureHook } from "./hooks/configure-hook.js";
