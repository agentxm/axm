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
  "include-dependencies": boolean;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const publishPackCommand: CommandModule<{}, PublishPackCommandArgs> = {
  command: "publish <pack>",
  describe: "Publish a pack to a registry",
  builder: (yargs) =>
    yargs
      .positional("pack", {
        type: "string",
        describe: "Pack name (@namespace/name or bare name)",
        demandOption: true,
      })
      .option("registry", {
        type: "string",
        describe: "Named registry source to publish to",
      })
      .option("include-dependencies", {
        alias: "d",
        type: "boolean",
        describe: "Publish locally managed dependency extensions alongside the pack",
        default: false,
      })
      .example("$0 packs publish @acme/frontend-tools", "Publish to the default registry")
      .example(
        "$0 packs publish frontend-tools --registry local",
        "Publish with namespace from settings to the local registry",
      ),
  handler: async (argv) => {
    await run(
      handlePublishPack({
        pack: argv.pack,
        registry: Option.fromNullable(argv.registry),
        includeDependencies: argv["include-dependencies"],
      }),
      {
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
      },
    );
  },
};
