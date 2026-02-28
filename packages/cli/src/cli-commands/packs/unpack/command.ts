/**
 * Unpack command yargs definition -- wires handler to `axm packs unpack`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { handleUnpack } from "./handler.js";

export interface UnpackCommandArgs {
  name: string;
  "strict-agent-sync": boolean;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const unpackCommand: CommandModule<{}, UnpackCommandArgs> = {
  command: "unpack <name>",
  describe: "Eject pack into individual entries",
  builder: (yargs) =>
    yargs
      .positional("name", {
        type: "string",
        describe: "Pack name to unpack",
        demandOption: true,
      })
      .option("strict-agent-sync", {
        type: "boolean",
        default: false,
        describe: "Fail when MCP agent sync has strict-policy failures",
      })
      .example("$0 packs unpack @acme/frontend-tools", "Eject pack contents into settings")
      .example(
        "$0 packs unpack @acme/frontend-tools --preview",
        "See what would change in settings",
      ),
  handler: async (argv) => {
    await run(
      handleUnpack({
        name: argv.name,
        strictAgentSync: argv["strict-agent-sync"],
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
        command: "packs unpack",
      },
    );
  },
};
