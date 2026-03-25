import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { AppError } from "../app-error/index.js";
import type { PromptCancelled } from "../prompt-cancelled.js";
import { TelemetryClient } from "../telemetry/index.js";
import {
  nonInteractiveFlag,
  outputFormatFlag,
  verboseFlag,
  debugFlag,
} from "../cli-flags/index.js";

// ---------------------------------------------------------------------------
// command_invoked
// ---------------------------------------------------------------------------

export interface CliCommandTelemetryOptions {
  readonly command: string;
  readonly event?: string;
  readonly properties?: Record<string, string>;
}

export const trackCliCommand = ({
  command,
  event = "command_invoked",
  properties,
}: CliCommandTelemetryOptions): Effect.Effect<void, never, TelemetryClient> =>
  Effect.gen(function* () {
    const telemetry = yield* TelemetryClient;
    yield* telemetry.trackEvent(event, { "cli.command": command, ...(properties ?? {}) });
  });

// ---------------------------------------------------------------------------
// command_completed
// ---------------------------------------------------------------------------

export interface CliCommandCompletedOptions {
  readonly command: string;
  readonly result: "success" | "error" | "cancelled" | "defect";
  readonly durationMs: number;
  readonly errorCode?: string;
}

export const trackCliCommandCompleted = (
  options: CliCommandCompletedOptions,
): Effect.Effect<void, never, TelemetryClient> =>
  Effect.gen(function* () {
    const telemetry = yield* TelemetryClient;
    yield* telemetry.trackEvent("command_completed", {
      "cli.command": options.command,
      "cli.result": options.result,
      "cli.duration_ms": String(options.durationMs),
      ...(options.errorCode && { "cli.error_code": options.errorCode }),
    });
  }).pipe(Effect.catchCause(() => Effect.void));

// ---------------------------------------------------------------------------
// Global flag capture
// ---------------------------------------------------------------------------

export const readGlobalFlagProperties = Effect.gen(function* () {
  const nonInteractive = yield* nonInteractiveFlag;
  const outputFormat = yield* outputFormatFlag;
  const verbose = yield* verboseFlag;
  const debug = yield* debugFlag;

  return {
    "cli.global.non_interactive": String(Option.getOrElse(nonInteractive, () => false)),
    "cli.global.output_format": Option.getOrElse(outputFormat, () => "none"),
    "cli.global.verbose": String(verbose),
    "cli.global.debug": String(debug),
  };
});

// ---------------------------------------------------------------------------
// Error reporting (unchanged)
// ---------------------------------------------------------------------------

export const reportCliError = (
  error: AppError | PromptCancelled,
  command: string,
): Effect.Effect<void, never, TelemetryClient> =>
  error._tag === "AppError"
    ? Effect.gen(function* () {
        const telemetry = yield* TelemetryClient;
        yield* telemetry.reportError({
          name: error.code,
          message: error.what,
          details: error.details,
          ...(Option.isSome(error.howToFix) && { howToFix: error.howToFix.value }),
          level: "error",
          handled: true,
          command,
        });
      }).pipe(Effect.catchCause(() => Effect.void))
    : Effect.void;

const defectMessage = (cause: Cause.Cause<unknown>): string => {
  const squashed = Cause.squash(cause);
  return squashed instanceof Error ? squashed.message : String(squashed);
};

export const reportCliDefect = (
  cause: Cause.Cause<unknown>,
  command: string,
): Effect.Effect<void, never, TelemetryClient> =>
  Cause.hasInterruptsOnly(cause)
    ? Effect.void
    : Effect.gen(function* () {
        const telemetry = yield* TelemetryClient;
        yield* telemetry.reportError({
          name: "Defect",
          message: defectMessage(cause),
          level: "fatal",
          handled: false,
          command,
        });
      }).pipe(Effect.catchCause(() => Effect.void));
