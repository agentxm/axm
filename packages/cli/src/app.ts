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

import { initCommand } from "./root/init.js";
import { skillsCommand } from "./root/skills/command.js";
import { packsCommand } from "./root/packs/command.js";
import { commandsCommand } from "./root/commands/command.js";
import { mcpServersCommand } from "./root/mcp-servers/command.js";
import { authCommand } from "./root/auth/command.js";
import { loginCommand } from "./root/auth/login.js";
import { logoutCommand } from "./root/auth/logout.js";
import { whoamiCommand } from "./root/auth/whoami.js";
import { tokenCommand } from "./root/auth/token.js";

const ROOT_COMMAND = "axm";
const version = loadVersion();
const LEARN_MORE_FOOTER =
  "LEARN MORE\n  Use 'axm <command> --help' for more information about a command.";

export const rootCommand = Command.make(ROOT_COMMAND).pipe(
  Command.withDescription(
    "Open extension manager for AI coding agents.\n  Manage skills, commands, MCP servers, and extension packs across your AI coding agents from a single CLI.",
  ),
  Command.annotate(LearnMore, LEARN_MORE_FOOTER),
  Command.withExamples([
    { command: "axm init", description: "Start managing extensions in your project" },
    {
      command: "axm skills install @acme/skills/code-review",
      description: "Add a code review skill to your agents",
    },
    {
      command: "axm packs install @acme/packs/frontend-tools",
      description: "Install a curated set of extensions at once",
    },
    { command: "axm whoami", description: "Check who you're authenticated as" },
  ]),
  Command.withSubcommands([
    { group: "GETTING STARTED", commands: [initCommand] },
    {
      group: "EXTENSIONS",
      commands: [skillsCommand, packsCommand, commandsCommand, mcpServersCommand],
    },
    {
      group: "AUTHENTICATION",
      commands: [authCommand, loginCommand, logoutCommand, whoamiCommand, tokenCommand],
    },
  ]),
  Command.withGlobalFlags(axmGlobalFlags),
);

const hasExplicitJsonFlag = (args: ReadonlyArray<string>): boolean => args.includes("--json");

export const run = async (args: ReadonlyArray<string> = process.argv.slice(2)): Promise<void> => {
  await runCliMain(
    (argv) =>
      Command.runWith(rootCommand, { version })(argv).pipe(
        // Built-in --help / --version output is formatter-driven, so explicit
        // --json has to be reflected here before Effect CLI starts rendering.
        Effect.provide(
          Layer.merge(
            baseLayer,
            CliOutput.layer(makeAxmFormatter({ json: hasExplicitJsonFlag(argv) })),
          ),
        ),
      ),
    { args },
  );
};
