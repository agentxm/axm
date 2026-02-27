/**
 * Commands uninstall command yargs definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { handleUninstallCommand } from "./handler.js";
import { UninstallCommandCommandWorkflowActionsLive } from "./command-actions.js";
import { CommandManagerLive } from "../../../extensions/commands/manager.js";

interface UninstallCommandCommandArgs {
  name: string;
  yes: boolean;
  preview: boolean;
  "non-interactive": boolean | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const uninstallCommandCommand: CommandModule<{}, UninstallCommandCommandArgs> = {
  command: "uninstall <name>",
  describe: "Uninstall a command",
  builder: (yargs) =>
    yargs
      .positional("name", {
        type: "string",
        describe: "Name of the command to uninstall",
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
      .example("$0 commands uninstall my-cmd", "Uninstall a command"),
  handler: async (argv) => {
    const actionsLayer = Layer.provide(
      UninstallCommandCommandWorkflowActionsLive,
      CommandManagerLive,
    );

    const program = handleUninstallCommand({
      commandName: argv.name,
      yes: argv.yes,
    }).pipe(Effect.provide(actionsLayer));

    await run(program, {
      workspace: {
        scope: "project",
        yes: argv.yes,
        nonInteractive: Option.fromNullable(argv["non-interactive"]),
        preview: argv.preview,
        agents: Option.none(),
      },
    });
  },
};
