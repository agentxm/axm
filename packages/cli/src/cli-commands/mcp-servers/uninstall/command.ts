import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { extractFlags } from "../../../cli-flags/index.js";
import { run } from "../../../runtime/index.js";
import { handleUninstallMcpServer } from "./handler.js";
import { UninstallMcpServerCommandWorkflowActionsLive } from "./command-actions.js";
import { McpServerManagerLive } from "../../../extensions/mcp-servers/manager.js";

interface UninstallMcpServerCommandArgs {
  name: string;
}

export const uninstallMcpServerCommand = {
  handler: async (argv: UninstallMcpServerCommandArgs & Record<string, unknown>) => {
    const actionsLayer = Layer.provide(
      UninstallMcpServerCommandWorkflowActionsLive,
      McpServerManagerLive,
    );

    const program = handleUninstallMcpServer({
      serverName: argv.name,
    }).pipe(Effect.provide(actionsLayer));

    await run(program, {
      flags: extractFlags(argv),
      workspace: {
        scope: "project",
        agents: Option.none(),
      },
      command: "mcp-servers uninstall",
    });
  },
};
