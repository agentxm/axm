import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import type * as Scope from "effect/Scope";
import * as ServiceMap from "effect/Context";
import * as Stream from "effect/Stream";
import {
  lifecycleEvents,
  type OperationEvent,
  type OperationLifecycleService,
} from "@agentxm/workspace-operations";
import {
  collectSensitiveStrings,
  errorClassForAppErrorCode,
  redactSensitiveText,
} from "../app-error/index.js";
import type { ExpectedCliError } from "./runtime-envelope.js";
import { isKnownFailure, toAppError } from "../app-error/conversions.js";
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
  readonly errorCategory?: string;
  readonly semanticProperties?: TelemetryProperties;
}

export const trackCliCommandCompleted = (
  options: CliCommandCompletedOptions,
): Effect.Effect<void, never, TelemetryClient> =>
  Effect.gen(function* () {
    const telemetry = yield* TelemetryClient;
    yield* telemetry.trackEvent(
      "command_completed",
      {
        "cli.command": options.command,
        "cli.result": options.result,
        "cli.duration_ms": options.durationMs,
        ...(options.errorCode !== undefined && { "cli.error_code": options.errorCode }),
        ...(options.errorCategory !== undefined && { "cli.error_category": options.errorCategory }),
        ...(options.semanticProperties ?? {}),
      },
      // The completion event orders before process exit on every termination
      // path, bounded by the client's event timeout.
      { bounded: true },
    );
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
  error: ExpectedCliError,
  command: string,
): Effect.Effect<void, never, TelemetryClient> => {
  const resolved =
    error._tag === "AppError" ? error : isKnownFailure(error) ? toAppError(error) : undefined;
  return resolved === undefined
    ? Effect.void
    : Effect.gen(function* () {
        const telemetry = yield* TelemetryClient;
        yield* telemetry.reportError({
          name: resolved.code,
          message: redactSensitiveText(resolved.detail, {
            secrets: collectSensitiveStrings(resolved.metadata),
          }),
          category: resolved.code,
          level: "error",
          errorClass: errorClassForAppErrorCode(resolved.code),
          handled: true,
          command,
        });
      }).pipe(Effect.catchCause(() => Effect.void));
};

// ---------------------------------------------------------------------------
// Command semantic properties (Ref-based forwarding)
// ---------------------------------------------------------------------------

export class CommandSemanticProperties extends ServiceMap.Service<
  CommandSemanticProperties,
  { readonly ref: Ref.Ref<TelemetryProperties> }
>()("axm.sh/cli-runtime/telemetry/CommandSemanticProperties") {}

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
// Lifecycle observation
// ---------------------------------------------------------------------------

interface LifecycleSummary {
  readonly events: number;
  readonly unitsStarted: number;
  readonly unitsResolved: number;
  readonly waits: number;
  readonly startedAtMs?: number;
}

const foldLifecycleSummary = (
  summary: LifecycleSummary,
  event: OperationEvent,
): LifecycleSummary => {
  const counted = { ...summary, events: summary.events + 1 };
  switch (event._tag) {
    case "OperationStarted":
      return { ...counted, startedAtMs: event.atMs };
    case "UnitStarted":
      return { ...counted, unitsStarted: counted.unitsStarted + 1 };
    case "UnitResolved":
      return { ...counted, unitsResolved: counted.unitsResolved + 1 };
    case "Waiting":
      return { ...counted, waits: counted.waits + 1 };
    case "PhaseStarted":
    case "UnitProgress":
    case "WaitEnded":
    case "OperationSettled":
      return counted;
  }
};

/**
 * Fold an operation's lifecycle into `cli.lifecycle.*` semantic properties at
 * settlement. Telemetry is an independent, lossy observer: it buffers with a
 * sliding window so it can never hold the frame or the machine writer back,
 * and it does not register as lossless.
 */
export const observeLifecycleForTelemetry = (
  lifecycle: OperationLifecycleService,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function* () {
    const events = yield* lifecycleEvents(lifecycle);
    yield* events.pipe(
      Stream.buffer({ capacity: 256, strategy: "sliding" }),
      Stream.runFold(
        (): LifecycleSummary => ({ events: 0, unitsStarted: 0, unitsResolved: 0, waits: 0 }),
        foldLifecycleSummary,
      ),
      Effect.flatMap((summary) =>
        Effect.gen(function* () {
          const settledAtMs = yield* Clock.currentTimeMillis;
          const existing = yield* getCommandSemanticProperties;
          yield* setCommandSemanticProperties({
            ...existing,
            "cli.lifecycle.events": summary.events,
            "cli.lifecycle.units_started": summary.unitsStarted,
            "cli.lifecycle.units_resolved": summary.unitsResolved,
            "cli.lifecycle.waits": summary.waits,
            ...(summary.startedAtMs === undefined
              ? {}
              : { "cli.lifecycle.duration_ms": Math.max(0, settledAtMs - summary.startedAtMs) }),
          });
        }),
      ),
      Effect.forkScoped,
    );
  });

// ---------------------------------------------------------------------------
// Defect reporting
// ---------------------------------------------------------------------------

const defectMessage = (cause: Cause.Cause<unknown>): string => {
  const squashed = Cause.squash(cause);
  return redactSensitiveText(squashed instanceof Error ? squashed.message : String(squashed));
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
          errorClass: "internal",
          handled: false,
          command,
        });
      }).pipe(Effect.catchCause(() => Effect.void));
