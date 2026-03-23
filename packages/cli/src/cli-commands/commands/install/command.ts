import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { extractFlags } from "../../../cli-flags/index.js";
import { run } from "../../../runtime/index.js";
import { handleInstallCommand } from "./handler.js";
import { InstallCommandCommandWorkflowActionsLive } from "./command-actions.js";
import { CommandManagerLive } from "../../../extensions/commands/manager.js";
import { type WorkspaceScope, resolveWorkspaceScope } from "../../../workspace/scope.js";

interface InstallCommandCommandArgs {
  source: string;
  scope: WorkspaceScope;
}

export const installCommandCommand = {
  handler: async (argv: InstallCommandCommandArgs & Record<string, unknown>) => {
    const scope = resolveWorkspaceScope(argv.scope);

    const actionsLayer = Layer.provide(
      InstallCommandCommandWorkflowActionsLive,
      CommandManagerLive,
    );

    const program = handleInstallCommand({
      source: argv.source,
      scope,
    }).pipe(Effect.provide(actionsLayer));

    await run(program, {
      flags: extractFlags(argv),
      workspace: {
        scope,
        agents: Option.none(),
      },
      command: "commands install",
    });
  },
};
