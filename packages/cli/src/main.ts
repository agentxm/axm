#!/usr/bin/env bun
import { Console, Effect } from "effect";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { extensionsCommand } from "./commands/extensions.js";
import { initCommand } from "./commands/init.js";
import { skillsCommand } from "./commands/skills.js";

const version = "0.0.1";

export const program = Effect.gen(function* () {
  yield* Effect.promise(() =>
    yargs(hideBin(process.argv))
      .scriptName("axm")
      .version(version)
      .help()
      .strict()
      .command(initCommand)
      .command(extensionsCommand)
      .command(skillsCommand)
      .demandCommand(0)
      .parseAsync(),
  );

  yield* Console.log("AgentXM CLI ready");
});

Effect.runPromise(program).catch((error) => {
  console.error(error);
  process.exit(1);
});
