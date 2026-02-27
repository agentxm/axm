/**
 * MCP servers install command yargs definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { handleInstallMcpServer } from "./handler.js";
import { InstallMcpServerCommandWorkflowActionsLive } from "./command-actions.js";
import { McpServerManagerLive } from "../../../extensions/mcp-servers/manager.js";
import {
  WORKSPACE_SCOPES,
  DEFAULT_WORKSPACE_SCOPE,
  type WorkspaceScope,
  resolveWorkspaceScope,
} from "../../../workspace/scope.js";

interface InstallMcpServerCommandArgs {
  source: string;
  scope: WorkspaceScope;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const installMcpServerCommand: CommandModule<{}, InstallMcpServerCommandArgs> = {
  command: "install <source>",
  describe: "Install an MCP server from a registry",
  builder: (yargs) =>
    yargs
      .positional("source", {
        type: "string",
        describe: "Registry MCP server reference (@namespace/mcp-servers/name or bare name)",
        demandOption: true,
      })
      .option("scope", {
        type: "string",
        choices: WORKSPACE_SCOPES,
        describe: "Configuration scope: project (default) or user",
        default: DEFAULT_WORKSPACE_SCOPE,
      })
      .example(
        "$0 mcp-servers install @acme/mcp-servers/my-server",
        "Install an MCP server from registry",
      )
      .example("$0 mcp-servers install my-server", "Install using default namespace"),
  handler: async (argv) => {
    const scope = resolveWorkspaceScope(argv.scope);

    const actionsLayer = Layer.provide(
      InstallMcpServerCommandWorkflowActionsLive,
      McpServerManagerLive,
    );

    const program = handleInstallMcpServer({
      source: argv.source,
      scope,
    }).pipe(Effect.provide(actionsLayer));

    await run(program, {
      flags: {
        nonInteractive: Option.fromNullable(argv["non-interactive"] as boolean | undefined),
        yes: argv["yes"] as boolean,
        force: argv["force"] as boolean,
        preview: argv["preview"] as boolean,
      },
      workspace: {
        scope,
        agents: Option.none(),
      },
    });
  },
};
