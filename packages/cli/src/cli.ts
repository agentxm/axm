/**
 * CLI entry point — root command composition, error routing, and run().
 *
 * Command definitions live in commands/<group>/<cmd>.ts.
 * Shared infrastructure (global flags, withCommandRuntime, base layer) lives
 * in command-runtime.ts.
 */

import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { CliError, Command } from "effect/unstable/cli";

import type { OutputFormat } from "./output.js";

import {
  axmGlobalFlags,
  baseLayer,
  cliCommandRef,
  effectCliExit,
  isEffectCliExit,
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
// Pre-Effect format detection
//
// Resolve --output-format from raw argv BEFORE Effect runs. If CLI parsing
// itself fails (e.g. unknown flag), Effect never executes — but we still
// need to know which channel to route the error to.
// ---------------------------------------------------------------------------

const resolveFormatFromArgv = (args: ReadonlyArray<string>): OutputFormat => {
  const idx = args.indexOf("--output-format");
  if (idx !== -1 && idx + 1 < args.length) {
    const value = args[idx + 1];
    if (value === "json" || value === "stream-json" || value === "text") return value;
  }
  return process.stdout.isTTY ? "text" : "json";
};

// ---------------------------------------------------------------------------
// Three-channel error handling
//
// Errors route to three channels simultaneously:
//   stdout    → typed error JSON (for programmatic consumers in json/stream-json)
//   stderr    → human-readable message (always, for pipe debugging and humans)
//   exit code → machine-readable status (2 = usage, 1 = runtime, 4 = cancelled)
// ---------------------------------------------------------------------------

const handleError = (error: unknown, format: OutputFormat): never => {
  if (isEffectCliExit(error)) {
    process.exit(error.exitCode);
  }

  if (CliError.isCliError(error)) {
    if (format !== "text") {
      // Extract human-readable messages from structured CliError errors
      const message =
        "errors" in error && Array.isArray(error.errors) && error.errors.length > 0
          ? error.errors.map((e: { message?: string }) => e.message ?? String(e)).join("; ")
          : error.message;
      const errorObj = { type: "error", code: "USAGE_ERROR", message };
      process.stdout.write(JSON.stringify(errorObj) + "\n");
    }
    process.exit(2);
  }

  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof Error && "code" in error ? String(error.code) : "UNKNOWN_ERROR";

  if (format === "text") {
    console.error(`✗ ${message}`);
  } else {
    const errorObj = { type: "error", code, message };
    process.stdout.write(JSON.stringify(errorObj) + "\n");
    console.error(`✗ ${message}`);
  }

  process.exit(1);
};

// ---------------------------------------------------------------------------
// Graceful shutdown
//
// SIGTERM/SIGINT → interrupt the running Effect fiber with a 5s timeout.
// Exit code 130 is POSIX convention for "terminated by signal" (128 + 2).
// Uses Effect.forkChild (supervised) so the fiber dies with parent.
// ---------------------------------------------------------------------------

const withGracefulShutdown = <A, E, R>(program: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    const fiber = yield* Effect.forkChild(program);

    const interruptAndExit = (exitCode: number) => {
      Effect.runFork(
        Fiber.interrupt(fiber).pipe(
          Effect.timeout("5 seconds"),
          Effect.ensuring(Effect.sync(() => process.exit(exitCode))),
        ),
      );
    };

    const onSigterm = () => interruptAndExit(130);
    const onSigint = () => interruptAndExit(130);
    process.on("SIGTERM", onSigterm);
    process.on("SIGINT", onSigint);

    const result = yield* Fiber.join(fiber);

    process.off("SIGTERM", onSigterm);
    process.off("SIGINT", onSigint);

    return result;
  });

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
        ) as Effect.Effect<void>,
      ),
    );
  } catch (error) {
    handleError(error, format);
  }
};

/** @deprecated Use {@link run} instead. */
export const runEffectCli = run;

export { cliCommand };
