import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { extractFlags } from "../../../cli-flags/index.js";
import { run } from "../../../runtime/index.js";
import { handleInstallMcpServer } from "./handler.js";
import { InstallMcpServerCommandWorkflowActionsLive } from "./command-actions.js";
import { McpServerManagerLive } from "../../../extensions/mcp-servers/manager.js";
import { type WorkspaceScope, resolveWorkspaceScope } from "../../../workspace/scope.js";

interface InstallMcpServerCommandArgs {
  source: string;
  scope: WorkspaceScope;
}

export const installMcpServerCommand = {
  handler: async (argv: InstallMcpServerCommandArgs & Record<string, unknown>) => {
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
      flags: extractFlags(argv),
      workspace: {
        scope,
        agents: Option.none(),
      },
      command: "mcp-servers install",
    });
  },
};
