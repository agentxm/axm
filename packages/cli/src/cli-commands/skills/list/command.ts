/**
 * List command yargs definition - wires handler to `axm skills list`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { handleList } from "./handler.js";

export interface ListCommandArgs {
  global: boolean;
  agent: ReadonlyArray<string>;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const listCommand: CommandModule<{}, ListCommandArgs> = {
  command: "list",
  aliases: ["ls"],
  describe: "List installed skills",
  builder: (yargs) =>
    yargs
      .option("global", {
        type: "boolean",
        describe: "List globally installed skills",
        default: false,
      })
      .option("agent", {
        type: "string",
        array: true,
        describe: "Filter by agent(s)",
        default: [],
      })
      .example("$0 skills list", "List all installed skills")
      .example("$0 skills list --global", "List globally installed skills")
      .example("$0 skills list --agent claude-code", "List skills for a specific agent"),
  handler: async (argv) => {
    await run(
      handleList({
        agents: argv.agent,
      }),
      {
        workspace: {
          global: argv.global,
          yes: true,
          nonInteractive: Option.some(true),
          preview: false,
          agents: Option.none(),
        },
      },
    );
  },
};
