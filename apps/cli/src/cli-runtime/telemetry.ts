import { randomUUID } from "node:crypto";
import type * as Cause from "effect/Cause";
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
} from "@agentxm/workspace-kernel/operations";
import { errorClassForAppErrorCode, type AppErrorCode } from "../app-error/index.js";
import {
  TelemetryClient,
  type TelemetryFailurePhase,
  type TelemetryProperties,
} from "../telemetry/index.js";
import { processTerminalFailure } from "./failure-identity.js";
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
    yield* telemetry.trackEvent(event, {
      "cli.command": options.command,
      "cli.result": options.result,
      "cli.duration_ms": options.durationMs,
      ...(options.errorCode !== undefined && { "cli.error_code": options.errorCode }),
      ...(options.errorCategory !== undefined && { "cli.error_category": options.errorCategory }),
      ...(options.semanticProperties ?? {}),
      ...productProperties,
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
// Command settlement
// ---------------------------------------------------------------------------

/** The failure a command settled with, as telemetry reports it. */
export interface CommandSettlementFailure {
  readonly code: AppErrorCode;
  /** Where in the invocation the command settled with the failure. */
  readonly phase: Exclude<TelemetryFailurePhase, "bootstrap">;
  /** Allowlisted diagnostic identity; see `failure-identity.ts`. */
  readonly kind: string;
  /** True when the command handled the failure; false for a defect. */
  readonly handled: boolean;
}

export interface CommandSettlement {
  /** Canonical command identity; absent when the envelope was given none. */
  readonly command?: string;
  readonly result: CliCommandCompletedOptions["result"];
  readonly durationMs: number;
  /** Absent for a success or a cancellation. */
  readonly failure?: CommandSettlementFailure;
  readonly semanticProperties?: TelemetryProperties;
}

/**
 * Report one settled command outcome: the error report, when the command
 * settled with a failure, and then the completion event, from the same
 * settlement. Every termination path — an operation resolution, a handled
 * error, a defect, a cancellation — settles through this one reporter, so a
 * failure is reported the same way whichever path it took. Error details can
 * quote arbitrary package content or resolved input; telemetry reports the
 * failure's allowlisted identity and local output owns the detail.
 */
export const recordCommandSettlement = (
  settlement: CommandSettlement,
): Effect.Effect<void, never, TelemetryClient> =>
  Effect.gen(function* () {
    const telemetry = yield* TelemetryClient;
    const failure = settlement.failure;
    if (failure !== undefined) {
      const productActivity = yield* currentProductActivity;
      yield* telemetry
        .reportError({
          phase: failure.phase,
          kind: failure.kind,
          category: failure.code,
          errorClass: errorClassForAppErrorCode(failure.code),
          handled: failure.handled,
          ...(settlement.command === undefined ? {} : { command: settlement.command }),
          ...(Option.isSome(productActivity)
            ? { activityId: productActivity.value.activityId }
            : {}),
        })
        .pipe(Effect.catchCause(() => Effect.void));
    }
    yield* trackCliCommandCompleted({
      command: settlement.command ?? "unknown",
      result: settlement.result,
      durationMs: settlement.durationMs,
      ...(failure === undefined ? {} : { errorCode: failure.code, errorCategory: failure.code }),
      ...(settlement.semanticProperties === undefined
        ? {}
        : { semanticProperties: settlement.semanticProperties }),
    });
  }).pipe(Effect.catchCause(() => Effect.void));

const reportTerminalFailure = <E>(
  cause: Cause.Cause<E>,
  settledIn:
    { readonly phase: "bootstrap" } | { readonly phase: "command"; readonly command: string },
): Effect.Effect<void, never, TelemetryClient> =>
  Effect.gen(function* () {
    const failure = processTerminalFailure(cause, settledIn.phase);
    if (Option.isNone(failure)) return;
    const telemetry = yield* TelemetryClient;
    yield* telemetry.reportError({
      phase: failure.value.phase,
      kind: failure.value.kind,
      category: failure.value.code,
      errorClass: errorClassForAppErrorCode(failure.value.code),
      handled: failure.value.handled,
      ...(settledIn.phase === "command" ? { command: settledIn.command } : {}),
    });
  }).pipe(Effect.catchCause(() => Effect.void));

/**
 * Report the failure that ended the invocation after escaping every command
 * envelope — a startup rejection, a parse error, a configuration failure
 * before the command ran, or an output failure after it — once, before the
 * process renders it. A cancellation, or help that exits successfully,
 * reports nothing.
 */
export const reportProcessFailure = <E>(
  cause: Cause.Cause<E>,
): Effect.Effect<void, never, TelemetryClient> =>
  reportTerminalFailure(cause, { phase: "bootstrap" });

/**
 * Report the failure of a command that runs without the runtime envelope —
 * help, which renders before any command runtime exists — in the command
 * phase under the command's canonical identity. The failure then continues
 * unchanged to the process, which renders it; the invocation has already
 * reported its one failure, so the process reports nothing more.
 */
export const withCommandFailureReport =
  (command: string) =>
  <A, E, R>(program: Effect.Effect<A, E, R>): Effect.Effect<A, E, R | TelemetryClient> =>
    program.pipe(
      Effect.onError((cause) => reportTerminalFailure(cause, { phase: "command", command })),
    );

/**
 * Give a whole invocation one process-owned telemetry reporter. A failure
 * that escapes every command envelope is reported once and then fails the
 * invocation unchanged, so the process renders and exits exactly as it would
 * without telemetry; the reporter releases, within its shutdown budget,
 * before that rendering.
 */
export const withProcessTelemetry =
  <RIn>(reporter: Layer.Layer<TelemetryClient, never, RIn>) =>
  <A, E, R>(
    program: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E, RIn | Exclude<R, TelemetryClient>> =>
    program.pipe(Effect.onError(reportProcessFailure), Effect.provide(reporter));

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
