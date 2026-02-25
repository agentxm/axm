#!/usr/bin/env node
import { createRequire } from "node:module";
import * as Effect from "effect/Effect";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { initCommand } from "./cli-commands/init/command.js";
import { packsCommand } from "./cli-commands/packs/command.js";
import { skillsCommand } from "./cli-commands/skills/command.js";

const loadVersion = (): string => {
  const require = createRequire(import.meta.url);
  for (const relPath of ["../package.json", "../../package.json"]) {
    try {
      return (require(relPath) as { version: string }).version;
    } catch {
      continue;
    }
  }
  return "unknown";
};

const version = loadVersion();

export const program = Effect.promise(() =>
  yargs(hideBin(process.argv))
    .scriptName("axm")
    .usage(`$0 v${version}\n\nOpen extension manager for AI coding agents.\n\nUsage: $0 <command>`)
    .version(version)
    .help()
    .strict()
    .option("non-interactive", {
      type: "boolean",
      describe: "Disable all interactive prompts",
    })
    .option("verbose", {
      alias: "v",
      type: "boolean",
      describe: "Show additional diagnostic details for errors",
      default: false,
    })
    .option("debug", {
      type: "boolean",
      describe: "Show full debug details for errors (implies --verbose)",
      default: false,
    })
    .command(initCommand)
    .command(skillsCommand)
    .command(packsCommand)
    .example("$0 init", "Initialize axm in current project")
    .example("$0 skills install owner/repo", "Install skills from a GitHub repository")
    .example("$0 packs install owner/repo", "Install an extension pack")
    .demandCommand(1)
    .fail((msg, _err, yargs) => {
      if (msg?.includes("Not enough non-option arguments")) {
        yargs.showHelp();
        process.exit(1);
      }
      console.error(msg ?? _err);
      process.exit(1);
    })
    .parseAsync(),
);

Effect.runPromise(program).catch((error) => {
  console.error(error);
  process.exit(1);
});
