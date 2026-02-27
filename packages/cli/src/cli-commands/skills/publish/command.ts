/**
 * Publish command yargs definition -- wires handler to `axm skills publish`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { handlePublish } from "./handler.js";

export interface PublishCommandArgs {
  extensions: string[];
  registry: string | undefined;
  yes: boolean;
  preview: boolean;
  "non-interactive": boolean | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const publishCommand: CommandModule<{}, PublishCommandArgs> = {
  command: "publish <extensions..>",
  describe: "Publish extensions to a registry",
  builder: (yargs) =>
    yargs
      .positional("extensions", {
        type: "string",
        array: true,
        describe: "Extension names or glob patterns (@namespace/skills/name, bare name, or glob)",
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
      .example("$0 skills publish @acme/skills/code-review", "Publish a single extension")
      .example("$0 skills publish effect-* commit", "Publish extensions matching patterns")
      .example(
        "$0 skills publish code-review --registry local",
        "Publish with namespace from settings to the local registry",
      ),
  handler: async (argv) => {
    await run(
      handlePublish({
        extensions: argv.extensions,
        registry: Option.fromNullable(argv.registry),
        yes: argv.yes,
      }),
      {
        workspace: {
          scope: "project",
          yes: argv.yes,
          nonInteractive: Option.fromNullable(argv["non-interactive"]),
          preview: argv.preview,
          agents: Option.none(),
        },
      },
    );
  },
};
