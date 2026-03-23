#!/usr/bin/env bun
// ==========================================================================
// main.ts — CLI entry point and runtime wiring
//
// This is the reference implementation for an Effect v4 CLI. It demonstrates:
//   1. Global flags as Effect services via GlobalFlag.setting()
//   2. Three-channel error handling (stdout, stderr, exit code)
//   3. Graceful shutdown with fiber interruption on SIGTERM/SIGINT
//   4. Pre-Effect format detection for error routing
//   5. NodeServices.layer provision for platform services
//
// File structure:
//   src/
//   ├── main.ts              ← You are here (root command, global flags, run)
//   ├── output.ts            ← Output formatting, NDJSON schemas, helpers
//   └── commands/
//       └── skills/
//           ├── command.ts    ← Parent command (composes subcommands)
//           ├── list.ts       ← Reference: instant command with structured output
//           ├── install.ts    ← Reference: long-running command with NDJSON streaming
//           └── *.ts          ← Stubs showing minimal command interface
// ==========================================================================
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { CliError, Command, Flag, GlobalFlag } from "effect/unstable/cli";

import { skillsCommand } from "./commands/skills/command.js";
import type { OutputFormat } from "./output.js";

// ---------------------------------------------------------------------------
// Global flags — available to every command in the tree
//
// GlobalFlag.setting() creates an Effect service (not just a parsed value).
// Each flag gets a unique key (e.g. "spike-non-interactive") and can be
// yielded in any handler anywhere in the command tree:
//
//   const yes = yield* yesFlag;   // boolean
//   const fmt = yield* outputFormatFlag; // Option<OutputFormat>
//
// This is the idiomatic Effect CLI pattern for cross-cutting concerns.
// The flags are registered once on the root command via
// Command.withGlobalFlags() and the CLI framework handles threading them
// through the Effect context.
// ---------------------------------------------------------------------------

const nonInteractiveFlag = GlobalFlag.setting("spike-non-interactive")({
  flag: Flag.boolean("non-interactive").pipe(
    Flag.optional,
    Flag.withDescription("Disable all interactive prompts"),
  ),
});

const yesFlag = GlobalFlag.setting("spike-yes")({
  flag: Flag.boolean("yes").pipe(
    Flag.withAlias("y"),
    Flag.withDescription("Auto-accept confirmation prompts"),
  ),
});

const forceFlag = GlobalFlag.setting("spike-force")({
  flag: Flag.boolean("force").pipe(
    Flag.withAlias("f"),
    Flag.withDescription("Override constraints that would cause failure"),
  ),
});

const previewFlag = GlobalFlag.setting("spike-preview")({
  flag: Flag.boolean("preview").pipe(Flag.withDescription("Display plan without applying")),
});

// Exported because command handlers need to yield this to resolve output format.
// Other global flags are only read by infrastructure (e.g. CliFlags service)
// and don't need to be exported.
export const outputFormatFlag = GlobalFlag.setting("spike-output-format")({
  flag: Flag.choice("output-format", ["text", "json", "stream-json"] as const).pipe(
    Flag.withDescription("Output format (default: auto-detect from TTY)"),
    Flag.optional,
  ),
});

const globalFlags = [
  nonInteractiveFlag,
  yesFlag,
  forceFlag,
  previewFlag,
  outputFormatFlag,
] as const;

// ---------------------------------------------------------------------------
// Root command
// ---------------------------------------------------------------------------

const ROOT_COMMAND = "axm-spike";
const VERSION = "0.0.1";

const rootCommand = Command.make(ROOT_COMMAND).pipe(
  Command.withDescription("Effect v4 CLI spike — proving out idiomatic command/flag patterns."),
  Command.withExamples([
    { command: "axm-spike skills list", description: "List installed skills" },
    { command: "axm-spike skills install owner/repo", description: "Install skills from GitHub" },
  ]),
  Command.withSubcommands([skillsCommand]),
  Command.withGlobalFlags(globalFlags),
);

// ---------------------------------------------------------------------------
// Three-channel error handling
//
// Errors are routed to three channels simultaneously:
//   stdout  → typed error JSON (for programmatic consumers in json/stream-json)
//   stderr  → human-readable message (always, for pipe debugging and humans)
//   exit code → machine-readable status (2 = usage/validation, 1 = runtime)
//
// This serves both humans (stderr) and machines (stdout + exit code) at once.
// See contributing/guides/cli-design.md#three-channel-error-pattern for the
// full design rationale.
// ---------------------------------------------------------------------------

/**
 * Resolve the output format from argv *before* Effect runs. This is
 * intentionally outside the Effect runtime because if CLI parsing itself
 * fails (e.g. unknown flag), Effect never executes — but we still need
 * to know which channel to route the error to. Raw argv scanning is the
 * only reliable approach here.
 */
const resolveFormatFromArgv = (args: ReadonlyArray<string>): OutputFormat => {
  const idx = args.indexOf("--output-format");
  if (idx !== -1 && idx + 1 < args.length) {
    const value = args[idx + 1];
    if (value === "json" || value === "stream-json" || value === "text") return value;
  }
  return process.stdout.isTTY ? "text" : "json";
};

/**
 * Route errors to the correct channels based on output format.
 *
 * Channel routing per format:
 * - text:        human-readable to stderr only (no stdout pollution)
 * - json:        typed error JSON to stdout + brief message to stderr
 * - stream-json: error event in NDJSON stream + brief message to stderr
 *
 * Exit codes follow POSIX conventions:
 * - 2 = usage/validation error (bad flags, missing args — from Effect CLI)
 * - 1 = application/runtime error (business logic failures)
 *
 * Uses process.stdout.write() (not console.log) to avoid extra newlines
 * that would break NDJSON parsing in stream-json mode.
 */
const handleError = (error: unknown, format: OutputFormat): never => {
  if (CliError.isCliError(error)) {
    // Usage/validation errors from Effect CLI (bad flags, missing args)
    if (format !== "text") {
      const errorObj = { type: "error", code: "USAGE_ERROR", message: String(error) };
      process.stdout.write(JSON.stringify(errorObj) + "\n");
    }
    process.exit(2);
  }

  // Application errors
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof Error && "code" in error ? String(error.code) : "UNKNOWN_ERROR";

  if (format === "text") {
    console.error(`✗ ${message}`);
  } else {
    // Both channels: typed JSON on stdout for machines, brief message on
    // stderr for humans debugging a pipe
    const errorObj = { type: "error", code, message };
    process.stdout.write(JSON.stringify(errorObj) + "\n");
    console.error(`✗ ${message}`);
  }

  process.exit(1);
};

// ---------------------------------------------------------------------------
// Graceful shutdown
//
// Desktop apps (Tauri, Electron) spawn the CLI as a subprocess and send
// SIGTERM/SIGINT to request termination. This wrapper ensures the running
// Effect program gets interrupted cleanly rather than force-killed.
//
// Uses Effect.forkChild (not forkDetach) so the fiber is supervised — if
// the parent exits for any reason, the child is automatically interrupted.
// The 5-second timeout is a safety net: if the program doesn't respond to
// interruption within 5s, we force-exit to avoid hanging processes.
//
// Exit code 130 is the POSIX convention for "terminated by signal" (128 + 2
// for SIGINT). Desktop apps and CI systems interpret this correctly.
// ---------------------------------------------------------------------------

const withGracefulShutdown = <A, E, R>(program: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    // forkChild: fiber dies with parent (supervised). forkDetach would leak.
    const fiber = yield* Effect.forkChild(program);

    const interruptAndExit = (exitCode: number) => {
      Effect.runFork(
        Fiber.interrupt(fiber).pipe(
          Effect.timeout("5 seconds"),
          Effect.ensuring(Effect.sync(() => process.exit(exitCode))),
        ),
      );
    };

    // Listen for shutdown signals
    const onSigterm = () => interruptAndExit(130);
    const onSigint = () => interruptAndExit(130);
    process.on("SIGTERM", onSigterm);
    process.on("SIGINT", onSigint);

    // Fiber.join blocks until the program completes (v4: Fiber is no longer
    // an Effect subtype, so explicit Fiber.join is required)
    const result = yield* Fiber.join(fiber);

    // Clean up listeners after normal completion to avoid leak warnings
    process.off("SIGTERM", onSigterm);
    process.off("SIGINT", onSigint);

    return result;
  });

// ---------------------------------------------------------------------------
// Run
//
// Execution order matters here:
//   1. resolveFormatFromArgv — detect format BEFORE Effect runs (for errors)
//   2. withGracefulShutdown — wrap program in signal-aware fiber
//   3. Command.runWith — parse argv and dispatch to command handler
//   4. Effect.provide(NodeServices.layer) — provide FileSystem + Path services
//   5. Effect.runPromise — bridge from Effect world to Node async
//   6. handleError — catch-all routes errors to the right channels
//
// The `as Effect.Effect<void>` cast is needed because Command.runWith
// returns a union type that TypeScript can't narrow without help.
//
// NodeServices.layer (from @effect/platform-node) provides both
// FileSystem and Path services. In v4, the service types themselves live
// in effect core (effect/FileSystem, effect/Path), but the Node
// implementations are still in @effect/platform-node.
// ---------------------------------------------------------------------------

const run = async (args: ReadonlyArray<string> = process.argv.slice(2)): Promise<void> => {
  const format = resolveFormatFromArgv(args);
  try {
    await Effect.runPromise(
      withGracefulShutdown(
        Command.runWith(rootCommand, { version: VERSION })(args).pipe(
          Effect.provide(NodeServices.layer),
        ) as Effect.Effect<void>,
      ),
    );
  } catch (error) {
    handleError(error, format);
  }
};

void run();
