import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as ServiceMap from "effect/Context";
import type { AppError } from "../app-error/index.js";
import type { PromptCancelled } from "../cli-prompt/prompt-cancelled.js";
import { TelemetryClient } from "../telemetry/index.js";
import type { TelemetryProperties } from "../telemetry/client.js";
import {
  nonInteractiveFlag,
  jsonFlag,
  verboseFlag,
  debugFlag,
  quietFlag,
} from "../cli-flags/index.js";

// ---------------------------------------------------------------------------
// command_invoked
// ---------------------------------------------------------------------------

export interface CliCommandTelemetryOptions {
  readonly command: string;
  readonly event?: string;
  readonly properties?: TelemetryProperties;
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
  readonly semanticProperties?: TelemetryProperties;
}

export const trackCliCommandCompleted = (
  options: CliCommandCompletedOptions,
): Effect.Effect<void, never, TelemetryClient> =>
  Effect.gen(function* () {
    const telemetry = yield* TelemetryClient;
    yield* telemetry.trackEvent("command_completed", {
      "cli.command": options.command,
      "cli.result": options.result,
      "cli.duration_ms": options.durationMs,
      ...(options.errorCode !== undefined && { "cli.error_code": options.errorCode }),
      ...(options.semanticProperties ?? {}),
    });
  }).pipe(Effect.catchCause(() => Effect.void));

// ---------------------------------------------------------------------------
// Global flag capture
// ---------------------------------------------------------------------------

export const readGlobalFlagProperties = Effect.gen(function* () {
  const nonInteractive = yield* nonInteractiveFlag;
  const json = yield* jsonFlag;
  const verbose = yield* verboseFlag;
  const debug = yield* debugFlag;
  const quiet = yield* quietFlag;

  return {
    "cli.global.non_interactive": String(Option.getOrElse(nonInteractive, () => false)),
    "cli.global.json": String(Option.getOrElse(json, () => false)),
    "cli.global.verbose": String(verbose),
    "cli.global.debug": String(debug),
    "cli.global.quiet": String(quiet),
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

// ---------------------------------------------------------------------------
// Command semantic properties (Ref-based forwarding)
// ---------------------------------------------------------------------------

export interface CommandSemanticPropertiesService {
  readonly ref: Ref.Ref<TelemetryProperties>;
}

export class CommandSemanticProperties extends ServiceMap.Service<
  CommandSemanticProperties,
  CommandSemanticPropertiesService
>()("@agentxm/client-core/CommandSemanticProperties") {}

/**
 * Set semantic telemetry properties from within a command handler.
 * These properties are read by the runtime envelope and merged into
 * the `command_completed` event. Safe to call when the service is
 * absent (e.g., in tests that bypass the runtime envelope).
 */
export const setCommandSemanticProperties = (
  properties: TelemetryProperties,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const option = yield* Effect.serviceOption(CommandSemanticProperties);
    yield* Option.match(option, {
      onNone: () => Effect.void,
      onSome: (svc) => Ref.set(svc.ref, properties),
    });
  });

/**
 * Read the current semantic telemetry properties.
 * Returns an empty record if the service is not available.
 */
const emptyProperties: TelemetryProperties = {};

export const getCommandSemanticProperties: Effect.Effect<TelemetryProperties> = Effect.gen(
  function* () {
    const option = yield* Effect.serviceOption(CommandSemanticProperties);
    return yield* Option.match(option, {
      onNone: () => Effect.succeed(emptyProperties),
      onSome: (svc) => Ref.get(svc.ref),
    });
  },
);

/**
 * Create a Layer that provides CommandSemanticProperties backed by a fresh Ref.
 */
export const CommandSemanticPropertiesLive: Layer.Layer<CommandSemanticProperties> = Layer.effect(
  CommandSemanticProperties,
  Ref.make(emptyProperties).pipe(Effect.map((ref) => ({ ref }))),
);

// ---------------------------------------------------------------------------
// Defect reporting
// ---------------------------------------------------------------------------

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
