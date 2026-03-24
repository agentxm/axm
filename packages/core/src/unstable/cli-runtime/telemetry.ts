import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { AppError } from "../app-error/index.js";
import type { PromptCancelled } from "../prompt-cancelled.js";
import { TelemetryClient } from "../telemetry/index.js";

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
    yield* telemetry.trackEvent(event, { command, ...(properties ?? {}) });
  });

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
