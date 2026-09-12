/**
 * Materializing an authored MCP server package during create, fork, adopt, and
 * native import.
 *
 * The authored closure recipe accepts a type-specific materialization because
 * an MCP server's canonical content is realized by the install operation
 * rather than by its manager. Both live in this capability, so every authoring
 * route reaches the same realization without importing a peer feature.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { McpServerExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import type { McpServerMaterializationFacts } from "@agentxm/extension-materialization";
import type { ExtensionManagerFailure } from "@agentxm/extension-materialization";
import { installMcpServer, type McpServerInstallRequirements } from "./install-operation.js";

/**
 * Realize the authored package's canonical content and native projections
 * without touching workspace state: the authored closure commits desired state
 * itself. Reports no acquisition facts — an authored package has no accepted
 * registry resolution for the entry writers to record.
 */
export const materializeAuthoredMcpServer = (args: {
  readonly ref: McpServerExtensionRef;
  readonly nonInteractive: boolean;
}): Effect.Effect<
  Option.Option<McpServerMaterializationFacts>,
  ExtensionManagerFailure,
  McpServerInstallRequirements
> =>
  installMcpServer({
    name: "install-mcp-server",
    args: {
      ref: args.ref,
      nonInteractive: args.nonInteractive,
      force: false,

      env: Option.none(),
    },
  }).pipe(Effect.as(Option.none<McpServerMaterializationFacts>()));
