/**
 * Root CLI application.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliOutput, Command } from "effect/unstable/cli";

import { runCliMain } from "@axm.sh/core/unstable/cli-runtime";

import { LearnMore, makeAxmFormatter } from "./formatter.js";

import { axmGlobalFlags, baseLayer } from "./runtime.js";
import { loadVersion } from "./version.js";

import { authCommand } from "./root/auth/command.js";
import { loginCommand } from "./root/auth/login.js";
import { logoutCommand } from "./root/auth/logout.js";
import { whoamiCommand } from "./root/auth/whoami.js";
import { tokenCommand } from "./root/auth/token.js";
import { initCommand } from "./root/init.js";
import { skillsCommand } from "./root/skills/command.js";
import { packsCommand } from "./root/packs/command.js";
import { commandsCommand } from "./root/commands/command.js";
import { mcpServersCommand } from "./root/mcp-servers/command.js";

const ROOT_COMMAND = "axm";
const version = loadVersion();
const LEARN_MORE_FOOTER =
  "LEARN MORE\n  Use 'axm <command> --help' for more information about a command.";

export const rootCommand = Command.make(ROOT_COMMAND).pipe(
  Command.withDescription("Open extension manager for AI coding agents."),
  Command.annotate(LearnMore, LEARN_MORE_FOOTER),
  Command.withExamples([
    { command: "axm init", description: "Initialize axm in the current project" },
    {
      command: "axm skills install @acme/skills/code-review",
      description: "Install a skill from the registry",
    },
    {
      command: "axm packs install @acme/packs/frontend-tools",
      description: "Install an extension pack from the registry",
    },
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

export const run = async (args: ReadonlyArray<string> = process.argv.slice(2)): Promise<void> => {
  await runCliMain(
    (argv) =>
      Command.runWith(rootCommand, { version })(argv).pipe(
        Effect.provide(Layer.merge(baseLayer, CliOutput.layer(makeAxmFormatter()))),
      ),
    { args },
  );
};
