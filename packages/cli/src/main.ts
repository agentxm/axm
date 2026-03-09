#!/usr/bin/env node
import * as Effect from "effect/Effect";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { authCommand } from "./cli-commands/auth/command.js";
import { loginCommand } from "./cli-commands/auth/login/command.js";
import { logoutCommand } from "./cli-commands/auth/logout/command.js";
import { tokenCommand } from "./cli-commands/auth/token/command.js";
import { whoamiCommand } from "./cli-commands/auth/whoami/command.js";
import { commandsCommand } from "./cli-commands/commands/command.js";
import { initCommand } from "./cli-commands/init/command.js";
import { mcpServersCommand } from "./cli-commands/mcp-servers/command.js";
import { packsCommand } from "./cli-commands/packs/command.js";
import { skillsCommand } from "./cli-commands/skills/command.js";
import { loadVersion } from "./version.js";

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
    .option("yes", {
      alias: "y",
      type: "boolean",
      describe: "Auto-accept confirmation prompts",
      default: false,
    })
    .option("force", {
      alias: "f",
      type: "boolean",
      describe: "Override constraints that would cause failure",
      default: false,
    })
    .option("preview", {
      type: "boolean",
      describe: "Display plan without applying",
      default: false,
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
    .command(commandsCommand)
    .command(mcpServersCommand)
    .command(authCommand)
    .command(loginCommand)
    .command(logoutCommand)
    .command(whoamiCommand)
    .command(tokenCommand)
    .example("$0 init", "Initialize axm in current project")
    .example("$0 skills install owner/repo", "Install skills from a GitHub repository")
    .example("$0 packs install owner/repo", "Install an extension pack")
    .example("$0 commands install @acme/commands/my-cmd", "Install a command from registry")
    .example("$0 mcp-servers install @acme/mcp-servers/my-server", "Install an MCP server")
    .example("$0 login", "Sign in to the default registry")
    .example("$0 whoami", "Show current authenticated identity")
    .example("$0 token", "Output current auth token to stdout")
    .demandCommand(1)
    .fail((msg, _err, yargs) => {
      if (msg?.includes("Not enough non-option arguments")) {
        yargs.showHelp();
        process.exit(1);
      }
      console.error(msg ?? (_err instanceof Error ? _err.message : String(_err)));
      process.exit(1);
    })
    .parseAsync(),
);

Effect.runPromise(program).catch((error) => {
  console.error(error);
  process.exit(1);
});
