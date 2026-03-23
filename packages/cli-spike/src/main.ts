#!/usr/bin/env bun
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { CliError, Command, Flag, GlobalFlag } from "effect/unstable/cli";

import { skillsCommand } from "./commands/skills/command.js";
import type { OutputFormat } from "./output.js";

// ---------------------------------------------------------------------------
// Global flags — available to every command in the tree
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
// ---------------------------------------------------------------------------

/**
 * Resolve the output format from argv before Effect runs, so the error
 * handler knows which channel to use even when parsing fails.
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
 * - text:        human-readable to stderr
 * - json:        typed error JSON to stdout + brief message to stderr
 * - stream-json: error event in NDJSON stream + brief message to stderr
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
    const errorObj = { type: "error", code, message };
    process.stdout.write(JSON.stringify(errorObj) + "\n");
    console.error(`✗ ${message}`);
  }

  process.exit(1);
};

// ---------------------------------------------------------------------------
// Graceful shutdown
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

    // Listen for shutdown signals
    const onSigterm = () => interruptAndExit(130);
    const onSigint = () => interruptAndExit(130);
    process.on("SIGTERM", onSigterm);
    process.on("SIGINT", onSigint);

    const result = yield* Fiber.join(fiber);

    // Clean up listeners after normal completion
    process.off("SIGTERM", onSigterm);
    process.off("SIGINT", onSigint);

    return result;
  });

// ---------------------------------------------------------------------------
// Run
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
