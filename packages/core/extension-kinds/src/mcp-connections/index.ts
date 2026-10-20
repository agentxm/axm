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
} from "./lifecycle/install/plan.js";
export {
  parseMcpServerUninstallRequest,
  planMcpServerUninstall,
} from "./lifecycle/uninstall/plan.js";
export { settleMcpSourceIdentityFor } from "./source-identity.js";

// Dependents' inferred types name these, so their declaration emit must be
// able to; knip skips exports tagged public.
/** @public */
export type { McpServerInstallSourceRequest } from "./lifecycle/install/plan.js";
/** @public */
export type { ParsedMcpServerInstallRequest } from "./lifecycle/install/plan.js";
