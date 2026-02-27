/**
 * MCP servers uninstall command yargs definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { handleUninstallMcpServer } from "./handler.js";
import { UninstallMcpServerCommandWorkflowActionsLive } from "./command-actions.js";
import { McpServerManagerLive } from "../../../extensions/mcp-servers/manager.js";

interface UninstallMcpServerCommandArgs {
  name: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const uninstallMcpServerCommand: CommandModule<{}, UninstallMcpServerCommandArgs> = {
  command: "uninstall <name>",
  describe: "Uninstall an MCP server",
  builder: (yargs) =>
    yargs
      .positional("name", {
        type: "string",
        describe: "Name of the MCP server to uninstall",
        demandOption: true,
      })
      .example("$0 mcp-servers uninstall my-server", "Uninstall an MCP server"),
  handler: async (argv) => {
    const actionsLayer = Layer.provide(
      UninstallMcpServerCommandWorkflowActionsLive,
      McpServerManagerLive,
    );

    const program = handleUninstallMcpServer({
      serverName: argv.name,
    }).pipe(Effect.provide(actionsLayer));

    await run(program, {
      flags: {
        nonInteractive: Option.fromNullable(argv["non-interactive"] as boolean | undefined),
        yes: argv["yes"] as boolean,
        force: argv["force"] as boolean,
        preview: argv["preview"] as boolean,
      },
      workspace: {
        scope: "project",
        agents: Option.none(),
      },
      command: "mcp-servers uninstall",
    });
  },
};
