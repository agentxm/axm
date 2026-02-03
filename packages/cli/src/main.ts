#!/usr/bin/env bun
import { Effect } from "effect";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { initCommand } from "./commands/init/command.js";
import { skillsCommand } from "./commands/skills/command.js";

const version = "0.0.1";

export const program = Effect.promise(() =>
  yargs(hideBin(process.argv))
    .scriptName("axm")
    .usage("$0 <command> [options]\n\nManage skills (extensions) for AI coding agents.")
    .version(version)
    .help()
    .strict()
    .option("verbose", {
      alias: "v",
      type: "boolean",
      describe: "Increase output detail",
    })
    .option("quiet", {
      alias: "q",
      type: "boolean",
      describe: "Suppress non-essential output",
    })
    .option("json", {
      type: "boolean",
      describe: "Output as JSON",
    })
    .option("non-interactive", {
      type: "boolean",
      describe: "Disable all prompts",
    })
    .command(initCommand)
    .command(skillsCommand)
    .example("$0 init", "Initialize axm in current project")
    .example("$0 skills install owner/repo", "Install skills from a GitHub repository")
    .demandCommand(1)
    .fail((msg, err, yargs) => {
      if (msg?.includes("Not enough non-option arguments")) {
        yargs.showHelp();
        process.exit(0);
      }
      console.error(msg);
      process.exit(1);
    })
    .parseAsync(),
);

Effect.runPromise(program).catch((error) => {
  console.error(error);
  process.exit(1);
});
