/**
 * Root CLI application.
 */

import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";

import { effectCliExit, runCliMain } from "@axm.sh/core/unstable/cli-runtime";

import { setRootCommand, showHelpFor } from "./help.js";
import { axmGlobalFlags, baseLayer } from "./runtime.js";
import { loadVersion } from "./version.js";

import { authCommand } from "./root/auth/command.js";
import { loginCommand } from "./root/auth/login/command.js";
import { logoutCommand } from "./root/auth/logout/command.js";
import { whoamiCommand } from "./root/auth/whoami/command.js";
import { tokenCommand } from "./root/auth/token/command.js";
import { initCommand } from "./root/init/command.js";
import { skillsCommand } from "./root/skills/command.js";
import { packsCommand } from "./root/packs/command.js";
import { commandsCommand } from "./root/commands/command.js";
import { mcpServersCommand } from "./root/mcp-servers/command.js";

const ROOT_COMMAND = "axm";
const version = loadVersion();

export const rootCommand = Command.make(ROOT_COMMAND, {}, () =>
  showHelpFor([ROOT_COMMAND]).pipe(Effect.andThen(Effect.fail(effectCliExit(1)))),
).pipe(
  Command.withDescription("Open extension manager for AI coding agents."),
  Command.withExamples([
    { command: "axm init", description: "Initialize axm in the current project" },
    {
      command: "axm skills install owner/repo",
      description: "Install skills from a GitHub repository",
    },
    { command: "axm packs install owner/repo", description: "Install an extension pack" },
    {
      command: "axm commands install @acme/commands/my-cmd",
      description: "Install a command from the registry",
    },
    {
      command: "axm mcp-servers install @acme/mcp-servers/my-server",
      description: "Install an MCP server from the registry",
    },
    { command: "axm login", description: "Sign in to the default registry" },
    { command: "axm whoami", description: "Show the current authenticated identity" },
    { command: "axm token", description: "Output the current auth token to stdout" },
  ]),
  Command.withSubcommands([
    initCommand,
    skillsCommand,
    packsCommand,
    commandsCommand,
    mcpServersCommand,
    authCommand,
    loginCommand,
    logoutCommand,
    whoamiCommand,
    tokenCommand,
  ]),
  Command.withGlobalFlags(axmGlobalFlags),
);

setRootCommand(rootCommand);

export const run = async (args: ReadonlyArray<string> = process.argv.slice(2)): Promise<void> => {
  await runCliMain(
    (argv) => Command.runWith(rootCommand, { version })(argv).pipe(Effect.provide(baseLayer)),
    { args },
  );
};
