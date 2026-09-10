/**
 * Uninstall MCP server intent type.
 *
 * Immutable intent payload for the `axm mcps uninstall` workflow.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { McpServerExtensionTarget } from "@agentxm/workspace-state";

/**
 * Intent for uninstalling an MCP server extension.
 */
export interface UninstallMcpServerCommandIntent {
  readonly targets: ReadonlyArray<McpServerExtensionTarget>;
}
