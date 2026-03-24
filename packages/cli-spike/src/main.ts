#!/usr/bin/env bun
// ==========================================================================
// main.ts — CLI entry point and runtime wiring
//
// Reference implementation for an Effect v4 CLI using @axm.sh/core services.
// Demonstrates:
//   1. Global flags: nonInteractiveFlag + outputFormatFlag from core
//   2. Per-command flags (yes, force, preview) from core — NOT global
//   3. Output/Activity services provided via withRuntime()
//   4. Three-channel error handling via core cli-runtime
//   5. Graceful shutdown with fiber interruption
// ==========================================================================
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import { Command } from "effect/unstable/cli";

import { nonInteractiveFlag, outputFormatFlag } from "@axm.sh/core/unstable/cli-flags";
import {
  effectCliExit,
  handleError,
  isEffectCliExit,
  makeUiLayer,
  reportCliDefect,
  reportCliError,
  resolveFormat,
  resolveFormatFromArgv,
  trackCliCommand,
  withGracefulShutdown,
} from "@axm.sh/core/unstable/cli-runtime";
import {
  TelemetryClientLive,
  resolveTelemetryMode,
} from "@axm.sh/core/unstable/telemetry";
import { renderAppError, type AppError } from "@axm.sh/core/unstable/app-error";
import type { PromptCancelled } from "@axm.sh/core/unstable/prompt-cancelled";

import { skillsCommand } from "./commands/skills/command.js";
import { telemetryCommand } from "./commands/telemetry/command.js";

// ---------------------------------------------------------------------------
// Global flags — truly global, available to every command
//
// Both flags come from @axm.sh/core (shared across all CLIs).
//
// IMPORTANT: yes/force/preview are NOT global — they are per-command flags
// imported from @axm.sh/core/unstable/cli-flags by commands that need them.
// This matches the project convention: only truly cross-cutting concerns
// are global.
// ---------------------------------------------------------------------------

const globalFlags = [nonInteractiveFlag, outputFormatFlag] as const;

const telemetryEnabledInTest = () => process.env["AXM_TELEMETRY_ENABLE_IN_TEST"] === "true";

const writeExpectedError = (
  error: AppError | PromptCancelled,
  format: ReturnType<typeof resolveFormat>,
): Effect.Effect<void> => {
  if (error._tag === "PromptCancelled") {
    return Effect.void;
  }

  return Effect.sync(() => {
    if (format === "text") {
      console.error(renderAppError(error));
      return;
    }

    process.stdout.write(
      JSON.stringify({
        type: "error",
        code: error.code,
        message: error.what,
      }) + "\n",
    );
    console.error(`\u2717 ${error.what}`);
  });
};

// ---------------------------------------------------------------------------
// Runtime layer helper — resolves format and provides Output + Activity
//
// Commands call withRuntime() to get format-aware services. The format
// drives which layer variant is provided:
//   text        → OutputLive + ActivityLive (interactive clack prompts)
//   json/stream → OutputStructured + ActivityStructured (NDJSON events)
//
// This replaces the old pattern of manually branching on format in every
// handler. Commands just use Output.result() and Activity.withSpinner()
// and the services handle format differences transparently.
// ---------------------------------------------------------------------------

export const withRuntime = <A, E, R>(
  program: Effect.Effect<A, E, R>,
  options?: {
    readonly command?: string;
    readonly isLongRunning?: boolean;
  },
) =>
  Effect.gen(function* () {
    const explicit = yield* outputFormatFlag;
    const format = resolveFormat(explicit, options);
    const command = options?.command ?? "unknown";
    const telemetryBaseUrl = process.env["AXM_TELEMETRY_BASE_URL"];
    const telemetryLayer = Layer.provide(
      TelemetryClientLive({
        mode: resolveTelemetryMode(
          {
            doNotTrack: process.env["DO_NOT_TRACK"],
            telemetry: process.env["AXM_TELEMETRY"],
          },
          {},
        ),
        command,
        client: { name: ROOT_COMMAND, version: VERSION },
        runtime: { name: "bun", version: process.versions["bun"] ?? "unknown" },
        ci: process.env["CI"] === "true",
        test: process.env["VITEST"] === "true" && !telemetryEnabledInTest(),
        ...(telemetryBaseUrl !== undefined && { baseUrl: telemetryBaseUrl }),
      }),
      FetchHttpClient.layer,
    );
    const commandLayer = Layer.mergeAll(makeUiLayer(format), telemetryLayer);
    const provided = trackCliCommand({ command }).pipe(
      Effect.andThen(program as Effect.Effect<A, AppError | PromptCancelled, R>),
      Effect.provide(commandLayer),
    );

    return yield* provided.pipe(
      Effect.catch((error: AppError | PromptCancelled) => {
        const exitCode = error._tag === "PromptCancelled" ? 0 : 1;
        return writeExpectedError(error, format).pipe(
          Effect.andThen(
            reportCliError(error, command).pipe(
              Effect.provide(telemetryLayer),
              Effect.catchCause(() => Effect.void),
            ),
          ),
          Effect.flatMap(() => Effect.die(effectCliExit(exitCode))),
        );
      }),
      Effect.catchCause((cause) => {
        const defect = Cause.squash(cause);
        if (isEffectCliExit(defect)) {
          return Effect.failCause(cause);
        }

        return reportCliDefect(cause, command).pipe(
          Effect.provide(telemetryLayer),
          Effect.andThen(Effect.failCause(cause)),
        );
      }),
    );
  });

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
    {
      command: "axm-spike telemetry handled",
      description: "Send a handled AppError to telemetry",
    },
  ]),
  Command.withSubcommands([skillsCommand, telemetryCommand]),
  Command.withGlobalFlags(globalFlags),
);

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const run = async (args: ReadonlyArray<string> = process.argv.slice(2)): Promise<void> => {
  const format = resolveFormatFromArgv(args);
  try {
    await Effect.runPromise(
      withGracefulShutdown(
        Command.runWith(rootCommand, { version: VERSION })(args).pipe(
          Effect.provide(Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer)),
        ) as Effect.Effect<void>,
      ),
    );
  } catch (error) {
    handleError(error, format);
  }
};

void run();
