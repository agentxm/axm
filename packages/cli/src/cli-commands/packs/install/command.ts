/**
 * Packs install command yargs definition - wires handler to `axm packs install`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { handleInstallPack } from "./handler.js";

interface InstallPackCommandArgs {
  source: string;
  global: boolean;
  yes: boolean;
  force: boolean;
  preview: boolean;
  "non-interactive": boolean | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const installPackCommand: CommandModule<{}, InstallPackCommandArgs> = {
  command: "install <source>",
  describe: "Install a pack and its extensions from a registry",
  builder: (yargs) =>
    yargs
      .positional("source", {
        type: "string",
        describe: "Registry pack reference (@scope/name or @scope/name@version)",
        demandOption: true,
      })
      .option("global", {
        type: "boolean",
        describe: "Install to global ~/.axm/ instead of local .axm/",
        default: false,
      })
      .option("yes", {
        alias: "y",
        type: "boolean",
        describe: "Skip confirmation prompts",
        default: false,
      })
      .option("force", {
        alias: "f",
        type: "boolean",
        describe: "Overwrite existing pack",
        default: false,
      })
      .option("preview", {
        type: "boolean",
        describe: "Display installation plan without applying",
        default: false,
      })
      .option("non-interactive", {
        type: "boolean",
        describe: "Disable all interactive prompts",
      })
      .example(
        "$0 packs install @acme/frontend-tools",
        "Install pack and all referenced extensions",
      )
      .example("$0 packs install @acme/frontend-tools@^2.0.0", "Install specific version range")
      .example("$0 packs install @acme/frontend-tools --preview", "See what would be installed"),
  handler: async (argv) => {
    await run(
      handleInstallPack({
        source: argv.source,
        global: argv.global,
        yes: argv.yes,
        force: argv.force,
        nonInteractive: Option.fromNullable(argv["non-interactive"]),
      }),
      {
        workspace: {
          global: argv.global,
          yes: argv.yes,
          nonInteractive: Option.fromNullable(argv["non-interactive"]),
          preview: argv.preview,
          agents: Option.none(),
        },
      },
    );
  },
};
