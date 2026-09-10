/**
 * Materializing an authored MCP server package during create, fork, adopt, and
 * native import.
 *
 * TRANSITIONAL-HANDLER-LOGIC: the authored closure recipe accepts a
 * type-specific materialization because an MCP server's canonical content is
 * realized by the install use case rather than by its manager. The command
 * families move this into the feature's own application API; until then the
 * three CLI handlers that adopt a native configuration share this one function
 * instead of each assembling the call.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { McpServerExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import type { McpServerMaterializationFacts } from "@agentxm/extension-materialization";
import { installMcpServer } from "./install.js";

/**
 * Realize the authored package's canonical content and native projections
 * without touching workspace state: the authored closure commits desired state
 * itself. Reports no acquisition facts — an authored package has no accepted
 * registry resolution for the entry writers to record.
 */
export const materializeAuthoredMcpServer = (args: {
  readonly ref: McpServerExtensionRef;
  readonly nonInteractive: boolean;
}) =>
  installMcpServer({
    name: "install-mcp-server",
    args: {
      ref: args.ref,
      nonInteractive: args.nonInteractive,
      force: false,
      allowWorkspaceSourceTransition: true,
      versionRange: Option.none(),
      skipSettings: Option.none(),
      skipStateWrites: true,
      env: Option.none(),
    },
  }).pipe(Effect.as(Option.none<McpServerMaterializationFacts>()));
