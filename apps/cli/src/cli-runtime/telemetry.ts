import { randomUUID } from "node:crypto";
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
import { errorClassForAppErrorCode } from "../app-error/index.js";
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
  }).pipe(Effect.catchCause(() => Effect.void));

// ---------------------------------------------------------------------------
// Purposeful product lifecycle
// ---------------------------------------------------------------------------

export type ProductActivityKind = "configure" | "install" | "publish" | "restore" | "update";

export interface ProductActivityIntent {
  readonly activity: ProductActivityKind;
  /** Whether a successful usable completion can activate a consumer cohort. */
  readonly activationEligible: boolean;
}

interface ProductActivityAttempt extends ProductActivityIntent {
  readonly activityId: string;
}

export class ProductActivity extends ServiceMap.Service<
  ProductActivity,
  { readonly ref: Ref.Ref<Option.Option<ProductActivityAttempt>> }
>()("axm.sh/cli-runtime/telemetry/ProductActivity") {}

export const ProductActivityLive: Layer.Layer<ProductActivity> = Layer.effect(
  ProductActivity,
  Ref.make(Option.none<ProductActivityAttempt>()).pipe(Effect.map((ref) => ({ ref }))),
);

const productActivityProperties = (attempt: ProductActivityAttempt): TelemetryProperties => ({
  "product.contract_version": 1,
  "product.activity_id": attempt.activityId,
  "product.activity": attempt.activity,
  "product.activation_eligible": attempt.activationEligible,
});

/**
 * Register and publish the first eligible product activity in this invocation.
 * Nested command adapters are intentionally idempotent and retain the outer
 * activity identity.
 */
export const startProductActivity = (intent: ProductActivityIntent): Effect.Effect<void> =>
  Effect.gen(function* () {
    const service = yield* Effect.serviceOption(ProductActivity);
    if (Option.isNone(service) || Option.isSome(yield* Ref.get(service.value.ref))) return;

    const attempt = { ...intent, activityId: randomUUID() } satisfies ProductActivityAttempt;
    yield* Ref.set(service.value.ref, Option.some(attempt));
    const telemetry = yield* Effect.serviceOption(TelemetryClient);
    if (Option.isSome(telemetry)) {
      yield* telemetry.value.trackEvent(
        "product_activity_started",
        productActivityProperties(attempt),
        { bounded: true },
      );
    }
  }).pipe(Effect.catchCause(() => Effect.void));

const currentProductActivity = Effect.gen(function* () {
  const service = yield* Effect.serviceOption(ProductActivity);
  return Option.isNone(service)
    ? Option.none<ProductActivityAttempt>()
    : yield* Ref.get(service.value.ref);
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
    const productActivity = yield* currentProductActivity;
    const outcome = options.semanticProperties?.["cli.outcome"];
    const appliedCount = options.semanticProperties?.["cli.applied_count"];
    const valueCompleted =
      (outcome === "applied" || outcome === "partial") &&
      typeof appliedCount === "number" &&
      appliedCount > 0;
    const event = Option.isSome(productActivity)
      ? "product_activity_finished"
      : "command_completed";
    const productProperties = Option.isSome(productActivity)
      ? {
          ...productActivityProperties(productActivity.value),
          "product.value_completed": valueCompleted,
          "product.activation_completed":
            productActivity.value.activationEligible && valueCompleted,
        }
      : {};
    yield* telemetry.trackEvent(
      event,
      {
        "cli.command": options.command,
        "cli.result": options.result,
        "cli.duration_ms": options.durationMs,
        ...(options.errorCode !== undefined && { "cli.error_code": options.errorCode }),
        ...(options.errorCategory !== undefined && { "cli.error_category": options.errorCategory }),
        ...(options.semanticProperties ?? {}),
        ...productProperties,
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
          // Error details can quote arbitrary package content or resolved input.
          // Telemetry reports the stable category; local output owns the detail.
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
          level: "fatal",
          errorClass: "internal",
          handled: false,
          command,
        });
      }).pipe(Effect.catchCause(() => Effect.void));
