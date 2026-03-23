import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { extractFlags } from "../../../cli-flags/index.js";
import { run } from "../../../runtime/index.js";
import { handleUninstallCommand } from "./handler.js";
import { UninstallCommandCommandWorkflowActionsLive } from "./command-actions.js";
import { CommandManagerLive } from "../../../extensions/commands/manager.js";

interface UninstallCommandCommandArgs {
  name: string;
}

export const uninstallCommandCommand = {
  handler: async (argv: UninstallCommandCommandArgs & Record<string, unknown>) => {
    const actionsLayer = Layer.provide(
      UninstallCommandCommandWorkflowActionsLive,
      CommandManagerLive,
    );

    const program = handleUninstallCommand({
      commandName: argv.name,
    }).pipe(Effect.provide(actionsLayer));

    await run(program, {
      flags: extractFlags(argv),
      workspace: {
        scope: "project",
        agents: Option.none(),
      },
      command: "commands uninstall",
    });
  },
};
