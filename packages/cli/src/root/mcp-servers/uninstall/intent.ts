/**
 * Uninstall MCP server intent type.
 *
 * Immutable intent payload for the `axm mcp-servers uninstall` workflow.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { McpServerExtensionTarget } from "@axm.sh/core/unstable/workspace";

/**
 * Intent for uninstalling an MCP server extension.
 */
export interface UninstallMcpServerCommandIntent {
  readonly targets: ReadonlyArray<McpServerExtensionTarget>;
}
