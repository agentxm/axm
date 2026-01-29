#!/usr/bin/env bun
import { Effect } from "effect";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { initCommand } from "./commands/init.js";
import { skillsCommand } from "./commands/skills.js";

const version = "0.0.1";

export const program = Effect.gen(function* () {
  yield* Effect.promise(() =>
    yargs(hideBin(process.argv))
      .scriptName("axm")
      .usage("$0 <command> [options]\n\nManage skills (extensions) for AI coding agents.")
      .version(version)
      .help()
      .strict()
      .command(initCommand)
      .command(skillsCommand)
      .example("$0 init", "Initialize axm in current project")
      .example("$0 skills add owner/repo", "Add skills from a GitHub repository")
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
});

Effect.runPromise(program).catch((error) => {
  console.error(error);
  process.exit(1);
});
