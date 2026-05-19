/**
 * Install MCP server intent type.
 *
 * Immutable intent payload for the `axm mcp-servers install` workflow.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Option from "effect/Option";
import type { McpServerExtensionRef } from "@agentxm/client-core/unstable/mcp-servers";

/**
 * Intent for installing an MCP server extension.
 */
export interface InstallMcpServerCommandIntent {
  readonly ref: McpServerExtensionRef;
  readonly versionRange: Option.Option<string>;
  readonly force: boolean;
  readonly env?: Readonly<Record<string, string>>;
  readonly nonInteractive?: boolean;
}
