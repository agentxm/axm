#!/usr/bin/env bun
import * as Effect from "effect/Effect";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { tuiCommand } from "./dev-cli-commands/tui/command.js";

const program = Effect.promise(() =>
  yargs(hideBin(process.argv))
    .scriptName("axm-dev")
    .usage("$0 <command> [options]\n\nDev tools for testing axm components.")
    .help()
    .strict()
    .command(tuiCommand)
    .example("$0 tui log", "Demo log output variants")
    .example("$0 tui spinner", "Demo spinner animation")
    .demandCommand(1)
    .fail((msg, _err, yargs) => {
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
