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
  yes: boolean;
  preview: boolean;
  "non-interactive": boolean | undefined;
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
      .option("yes", {
        alias: "y",
        type: "boolean",
        describe: "Skip confirmation prompts",
        default: false,
      })
      .option("preview", {
        type: "boolean",
        describe: "Display uninstall plan without applying",
        default: false,
      })
      .option("non-interactive", {
        type: "boolean",
        describe: "Disable all interactive prompts",
      })
      .example("$0 mcp-servers uninstall my-server", "Uninstall an MCP server"),
  handler: async (argv) => {
    const actionsLayer = Layer.provide(
      UninstallMcpServerCommandWorkflowActionsLive,
      McpServerManagerLive,
    );

    const program = handleUninstallMcpServer({
      serverName: argv.name,
      yes: argv.yes,
    }).pipe(Effect.provide(actionsLayer));

    await run(program, {
      workspace: {
        global: false,
        yes: argv.yes,
        nonInteractive: Option.fromNullable(argv["non-interactive"]),
        preview: argv.preview,
        agents: Option.none(),
      },
    });
  },
};
