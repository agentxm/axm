/**
 * Materializing an authored MCP server package during create, fork, adopt, and
 * native import.
 *
 * The authored closure recipe accepts a type-specific materialization because
 * an MCP server's canonical content is realized by the install operation
 * rather than by its manager, so every authoring route reaches the same
 * realization through this kind.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { McpServerExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import type {
  ExtensionManagerFailure,
  McpConnectionInstallRequirements,
  McpServerManager,
  McpServerMaterializationFacts,
} from "@agentxm/workspace-kernel/materialization";
import { installMcpServer } from "./install-operation.js";

/**
 * Realize the authored package's canonical content and native projections
 * without touching workspace state: the authored closure commits desired state
 * itself. Native observations are returned without acquired content integrity,
 * because the package remains workspace authored.
 */
export const materializeAuthoredMcpServer = (args: {
  readonly ref: McpServerExtensionRef;
  readonly nonInteractive: boolean;
}): Effect.Effect<
  Option.Option<McpServerMaterializationFacts>,
  ExtensionManagerFailure,
  McpServerManager | McpConnectionInstallRequirements
> =>
  installMcpServer({
    name: "install-mcp-server",
    args: {
      ref: args.ref,
      authorizeDistributionSelection: true,
      nonInteractive: args.nonInteractive,
      force: false,
    },
  }).pipe(
    Effect.map((result) => {
      const nativeLocations = result.artifact?.nativeLocations ?? [];
      return Option.some({
        treeIntegrity: Option.none(),
        removal: Option.none(),
        observation: {
          nativeLocations,
          agents: result.artifact?.agents ?? [],
          targets: nativeLocations.map((native) => ({
            path: native.address.path,
            agentIds: native.configuredConsumers,
          })),
        },
      } satisfies McpServerMaterializationFacts);
    }),
  );
