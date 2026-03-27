/**
 * Install MCP server intent type.
 *
 * Immutable intent payload for the `axm mcp-servers install` workflow.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Option from "effect/Option";
import type { McpServerExtensionRef } from "@axm.sh/core/unstable/extensions";

/**
 * Intent for installing an MCP server extension.
 */
export interface InstallMcpServerCommandIntent {
  readonly ref: McpServerExtensionRef;
  readonly versionConstraint: Option.Option<string>;
  readonly force: boolean;
}
