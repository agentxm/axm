/**
 * Packs uninstall command yargs definition - wires handler to `axm packs uninstall`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { handleUninstallPack } from "./handler.js";

export interface UninstallPackCommandArgs {
  name: string;
  yes: boolean;
  preview: boolean;
  "non-interactive": boolean | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const uninstallPackCommand: CommandModule<{}, UninstallPackCommandArgs> = {
  command: "uninstall <name>",
  describe: "Uninstall a pack and remove orphaned extensions",
  builder: (yargs) =>
    yargs
      .positional("name", {
        type: "string",
        describe: "Name or glob pattern of the pack to uninstall",
        demandOption: true,
      })
      .option("yes", {
        alias: "y",
        type: "boolean",
        describe: "Skip confirmation prompt",
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
      .example("$0 packs uninstall my-pack", "Uninstall a pack and its orphaned extensions")
      .example("$0 packs uninstall my-pack --preview", "Preview what would be uninstalled")
      .example("$0 packs uninstall my-pack --yes", "Uninstall without confirmation prompt")
      .example("$0 packs uninstall acme-*", "Uninstall all packs matching a pattern"),
  handler: async (argv) => {
    await run(
      handleUninstallPack({
        name: argv.name,
        yes: argv.yes,
      }),
      {
        workspace: {
          global: false,
          yes: argv.yes,
          nonInteractive: Option.fromNullable(argv["non-interactive"]),
          preview: argv.preview,
          agents: Option.none(),
        },
      },
    );
  },
};
