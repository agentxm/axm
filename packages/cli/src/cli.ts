/**
 * CLI entry point — root command composition, error routing, and run().
 *
 * Command definitions live in commands/<group>/<cmd>.ts.
 * Shared infrastructure (global flags, withCommandRuntime, base layer) lives
 * in command-runtime.ts.
 */

import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";

import {
  handleError,
  resolveFormatFromArgv,
  withGracefulShutdown,
} from "@axm.sh/core/unstable/cli-runtime";

import {
  axmGlobalFlags,
  baseLayer,
  cliCommandRef,
  effectCliExit,
  showHelpFor,
} from "./command-runtime.js";
import { loadVersion } from "./version.js";

// Command group imports
import { authCommand } from "./commands/auth/command.js";
import { loginCommand } from "./commands/auth/login.js";
import { logoutCommand } from "./commands/auth/logout.js";
import { whoamiCommand } from "./commands/auth/whoami.js";
import { tokenCommand } from "./commands/auth/token.js";
import { initCommand } from "./commands/init/command.js";
import { skillsCommand } from "./commands/skills/command.js";
import { packsCommand } from "./commands/packs/command.js";
import { commandsCommand } from "./commands/commands/command.js";
import { mcpServersCommand } from "./commands/mcp-servers/command.js";

const ROOT_COMMAND = "axm";
const version = loadVersion();

// ---------------------------------------------------------------------------
// Root command
// ---------------------------------------------------------------------------

const cliCommand = Command.make(ROOT_COMMAND, {}, () =>
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
    // Top-level shortcuts for auth commands
    loginCommand,
    logoutCommand,
    whoamiCommand,
    tokenCommand,
  ]),
  Command.withGlobalFlags(axmGlobalFlags),
);

cliCommandRef.current = cliCommand;

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export const run = async (args: ReadonlyArray<string> = process.argv.slice(2)): Promise<void> => {
  const format = resolveFormatFromArgv(args);
  try {
    await Effect.runPromise(
      withGracefulShutdown(
        Command.runWith(cliCommand, { version })(args).pipe(
          Effect.provide(baseLayer),
        ),
      ),
    );
  } catch (error) {
    handleError(error, format);
  }
};

/** @deprecated Use {@link run} instead. */
export const runEffectCli = run;

export { cliCommand };
