/**
 * MCP connections extension kind: what the lifecycle and authoring features and
 * the application consume.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export {
  McpAgentSyncRefused,
  McpCanonicalPathUnsafe,
  McpConnectionConflict,
  McpInstallStateMissing,
  McpConfigurationRefused,
  McpWorkspacePackageInvalid,
} from "./errors.js";
export { materializeAuthoredMcpServer } from "./install/authored-materialization.js";
export {
  discoverMcpServerRefs,
  finalizeMcpServerInstallIntent,
  parseMcpServerInstallRequest,
  planMcpServerInstall,
  resolveMcpServerSourceRequest,
  type McpServerInstallIntent,
  type McpServerInstallSourceRequest,
  type ParsedMcpServerInstallRequest,
} from "./lifecycle/install/plan.js";
export {
  parseMcpServerUninstallRequest,
  planMcpServerUninstall,
  type McpServerUninstallIntent,
} from "./lifecycle/uninstall/plan.js";
export { settleMcpSourceIdentityFor } from "./source-identity.js";
