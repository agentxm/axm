/**
 * Publish command yargs definition -- wires handler to `axm packs publish`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { handlePublishPack } from "./handler.js";

export interface PublishPackCommandArgs {
  pack: string;
  registry: string | undefined;
  yes: boolean;
  preview: boolean;
  "non-interactive": boolean | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const publishPackCommand: CommandModule<{}, PublishPackCommandArgs> = {
  command: "publish <pack>",
  describe: "Publish a managed pack to a registry",
  builder: (yargs) =>
    yargs
      .positional("pack", {
        type: "string",
        describe: "Pack name (@scope/name or bare name)",
        demandOption: true,
      })
      .option("registry", {
        type: "string",
        describe: "Named registry source to publish to",
      })
      .option("yes", {
        alias: "y",
        type: "boolean",
        describe: "Skip confirmation prompts",
        default: false,
      })
      .option("preview", {
        type: "boolean",
        describe: "Display publish plan without applying",
        default: false,
      })
      .option("non-interactive", {
        type: "boolean",
        describe: "Disable all interactive prompts",
      })
      .example("$0 packs publish @acme/frontend-tools", "Publish to the default registry")
      .example(
        "$0 packs publish frontend-tools --registry local",
        "Publish with scope from settings to the local registry",
      ),
  handler: async (argv) => {
    await run(
      handlePublishPack({
        pack: argv.pack,
        registry: Option.fromNullable(argv.registry),
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
