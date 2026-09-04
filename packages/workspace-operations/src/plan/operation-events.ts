/**
 * Operation lifecycle events — the one live contract between a running
 * operation and everything that observes it.
 *
 * An operation publishes schema-backed, typed lifecycle events (operation and
 * phase transitions, unit start, progress, and settlement, waiting reasons, and
 * exactly one terminal settled event) to an invocation-scoped broadcast.
 * Observers — the human live frame, the machine event writer, telemetry —
 * subscribe independently; none of them controls execution or keeps a second
 * account of what happened. Events carry identifiers, labels, counts, and
 * states, never presentation phrases; wording belongs to the observer.
 *
 * Broadcast policy: the publisher is unbounded and never applies backpressure.
 * Lifecycle events are discrete state transitions, so their count is bounded
 * by the planned units; continuous measurements such as downloaded bytes are
 * throttled at the producer and never published per chunk. Every operation
 * ends with a settled event, and settled output waits on the drain latch that
 * lossless subscribers complete. Publishing is a no-op when no broadcast is
 * provided.
 */

import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Latch from "effect/Latch";
import * as MutableRef from "effect/MutableRef";
import * as Option from "effect/Option";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";
import * as ServiceMap from "effect/Context";
import * as Stream from "effect/Stream";

import { BlockingClassSchema } from "./plan.js";
import { OperationPhaseSchema, UnitStateSchema, type UnitState } from "./operation-resolution.js";

// -----------------------------------------------------------------------------
// Event schema
// -----------------------------------------------------------------------------

export const OperationModeSchema = Schema.Literals(["preview", "apply"] as const).annotate({
  identifier: "OperationMode",
  title: "Operation Mode",
  description: "Whether the operation previews or applies its plan.",
});
export type OperationMode = typeof OperationModeSchema.Type;

/**
 * Terminal outcome carried by the settled event: a plan-family outcome, or
 * `completed` for an operation without a plan-family resolution (a read, an
 * upgrade step sequence, an authentication flow) that finished successfully.
 */
export const SettledOutcomeSchema = Schema.Literals([
  "previewed",
  "applied",
  "no-op",
  "partial",
  "failed",
  "blocked",
  "cancelled",
  "interrupted",
  "completed",
] as const).annotate({
  identifier: "SettledOutcome",
  title: "Settled Outcome",
  description: "Terminal outcome of an observed operation.",
});
export type SettledOutcome = typeof SettledOutcomeSchema.Type;

export const ProgressUnitSchema = Schema.Literals(["bytes", "files", "items"] as const).annotate({
  identifier: "ProgressUnit",
  title: "Progress Unit",
  description: "Unit of a continuous progress measurement.",
});
export type ProgressUnit = typeof ProgressUnitSchema.Type;

/** Per-operation monotonic order and wall-clock time, on every event. */
const EventBase = {
  seq: Schema.Number,
  atMs: Schema.Number,
};

export const OperationStartedEventSchema = Schema.TaggedStruct("OperationStarted", {
  ...EventBase,
  operationId: Schema.String,
  name: Schema.String,
  mode: OperationModeSchema,
}).annotate({ identifier: "OperationStartedEvent" });

export const PhaseStartedEventSchema = Schema.TaggedStruct("PhaseStarted", {
  ...EventBase,
  phase: OperationPhaseSchema,
}).annotate({ identifier: "PhaseStartedEvent" });

export const UnitStartedEventSchema = Schema.TaggedStruct("UnitStarted", {
  ...EventBase,
  unitId: Schema.String,
  label: Schema.String,
  index: Schema.Number,
  total: Schema.optional(Schema.Number),
  parentUnitId: Schema.optional(Schema.String),
}).annotate({ identifier: "UnitStartedEvent" });

export const UnitProgressEventSchema = Schema.TaggedStruct("UnitProgress", {
  ...EventBase,
  unitId: Schema.String,
  done: Schema.Number,
  total: Schema.optional(Schema.Number),
  unit: ProgressUnitSchema,
}).annotate({ identifier: "UnitProgressEvent" });

export const UnitResolvedEventSchema = Schema.TaggedStruct("UnitResolved", {
  ...EventBase,
  unitId: Schema.String,
  label: Schema.String,
  state: UnitStateSchema,
  index: Schema.Number,
  total: Schema.optional(Schema.Number),
}).annotate({ identifier: "UnitResolvedEvent" });

export const WaitingEventSchema = Schema.TaggedStruct("Waiting", {
  ...EventBase,
  blockingClass: BlockingClassSchema,
  subject: Schema.String,
  detail: Schema.String,
}).annotate({ identifier: "WaitingEvent" });

export const WaitEndedEventSchema = Schema.TaggedStruct("WaitEnded", {
  ...EventBase,
  subject: Schema.String,
}).annotate({ identifier: "WaitEndedEvent" });

export const OperationSettledEventSchema = Schema.TaggedStruct("OperationSettled", {
  ...EventBase,
  outcome: SettledOutcomeSchema,
}).annotate({ identifier: "OperationSettledEvent" });

/**
 * The published lifecycle event union. `seq` is strictly increasing within one
 * operation; `atMs` is wall-clock milliseconds. Exactly one `OperationSettled`
 * event ends every operation.
 */
export const OperationEventSchema = Schema.Union([
  OperationStartedEventSchema,
  PhaseStartedEventSchema,
  UnitStartedEventSchema,
  UnitProgressEventSchema,
  UnitResolvedEventSchema,
  WaitingEventSchema,
  WaitEndedEventSchema,
  OperationSettledEventSchema,
]).annotate({
  identifier: "OperationEvent",
  title: "Operation Lifecycle Event",
  description:
    "One typed lifecycle event of a running AXM operation: operation, phase, unit, waiting, or settlement transition.",
});
export type OperationEvent = typeof OperationEventSchema.Type;
export type OperationEventEncoded = typeof OperationEventSchema.Encoded;

/** Fields the service fills in for every event it publishes. */
export type OperationEventInput = (seq: number, atMs: number) => OperationEvent;

// -----------------------------------------------------------------------------
// Service
// -----------------------------------------------------------------------------

export interface OperationLifecycleService {
  readonly operationId: string;
  readonly name: string;
  readonly mode: OperationMode;
  /** Unbounded, invocation-scoped broadcast; subscribe before the operation runs. */
  readonly events: PubSub.PubSub<OperationEvent>;
  /** Publish one event; the service assigns `seq` and `atMs` atomically. */
  readonly publish: (make: OperationEventInput) => Effect.Effect<void>;
  /** Next index for a unit whose caller has no planned index. */
  readonly nextUnitIndex: Effect.Effect<number>;
  /** Publish the terminal event once; later calls are no-ops. */
  readonly settle: (outcome: SettledOutcome) => Effect.Effect<void>;
  /** Whether the terminal event was published. */
  readonly settled: Effect.Effect<boolean>;
  /** Opens when the operation settled and every registered lossless subscriber acknowledged. */
  readonly drained: Latch.Latch;
  /**
   * Register a subscriber that must observe every event through settlement.
   * Returns the acknowledgement; run it under `Effect.ensuring` so
   * interruption also acknowledges.
   */
  readonly registerLossless: Effect.Effect<Effect.Effect<void>>;
}

export class OperationLifecycle extends ServiceMap.Service<
  OperationLifecycle,
  OperationLifecycleService
>()("@agentxm/workspace-operations/plan/operation-events/OperationLifecycle") {}

interface DrainState {
  readonly settled: boolean;
  readonly pending: number;
}

const operationCounter = MutableRef.make(0);

export const makeOperationLifecycle = (args: {
  readonly name: string;
  readonly mode: OperationMode;
}): Effect.Effect<OperationLifecycleService> =>
  Effect.gen(function* () {
    const events = yield* PubSub.unbounded<OperationEvent>();
    const sequence = yield* Ref.make(0);
    const unitIndex = yield* Ref.make(0);
    const drain = yield* Ref.make<DrainState>({ settled: false, pending: 0 });
    const drained = yield* Latch.make(false);
    const operationId = `operation-${String(MutableRef.incrementAndGet(operationCounter))}`;

    const openWhenDrained = (state: DrainState): Effect.Effect<void> =>
      state.settled && state.pending === 0 ? Effect.asVoid(drained.open) : Effect.void;

    const publish = (make: OperationEventInput): Effect.Effect<void> =>
      Effect.gen(function* () {
        const seq = yield* Ref.modify(sequence, (current) => [current + 1, current + 1] as const);
        const atMs = yield* Clock.currentTimeMillis;
        yield* PubSub.publish(events, make(seq, atMs));
      });

    const settle = (outcome: SettledOutcome): Effect.Effect<void> =>
      Effect.gen(function* () {
        const first = yield* Ref.modify(drain, (state) =>
          state.settled
            ? ([false, state] as const)
            : ([true, { ...state, settled: true }] as const),
        );
        if (!first) return;
        yield* publish((seq, atMs) => ({ _tag: "OperationSettled", seq, atMs, outcome }));
        yield* Effect.flatMap(Ref.get(drain), openWhenDrained);
      });

    const registerLossless: Effect.Effect<Effect.Effect<void>> = Ref.update(drain, (state) => ({
      ...state,
      pending: state.pending + 1,
    })).pipe(
      Effect.as(
        Ref.modify(drain, (state) => {
          const next = { ...state, pending: Math.max(0, state.pending - 1) };
          return [next, next] as const;
        }).pipe(Effect.flatMap(openWhenDrained)),
      ),
    );

    return {
      operationId,
      name: args.name,
      mode: args.mode,
      events,
      publish,
      nextUnitIndex: Ref.modify(unitIndex, (current) => [current, current + 1] as const),
      settle,
      settled: Effect.map(Ref.get(drain), (state) => state.settled),
      drained,
      registerLossless,
    } satisfies OperationLifecycleService;
  });

// -----------------------------------------------------------------------------
// Producers (no-ops without a broadcast)
// -----------------------------------------------------------------------------

const withLifecycle = <A>(
  onSome: (service: OperationLifecycleService) => Effect.Effect<A>,
  onNone: () => Effect.Effect<A>,
): Effect.Effect<A> =>
  Effect.flatMap(Effect.serviceOption(OperationLifecycle), (service) =>
    Option.isNone(service) ? onNone() : onSome(service.value),
  );

/** Publish one lifecycle event. No-op when no broadcast is provided. */
export const publishOperationEvent = (make: OperationEventInput): Effect.Effect<void> =>
  withLifecycle(
    (service) => service.publish(make),
    () => Effect.void,
  );

export const publishPhaseStarted = (phase: typeof OperationPhaseSchema.Type): Effect.Effect<void> =>
  publishOperationEvent((seq, atMs) => ({ _tag: "PhaseStarted", seq, atMs, phase }));

export const publishWaiting = (wait: {
  readonly blockingClass: typeof BlockingClassSchema.Type;
  readonly subject: string;
  readonly detail: string;
}): Effect.Effect<void> =>
  publishOperationEvent((seq, atMs) => ({ _tag: "Waiting", seq, atMs, ...wait }));

export const publishWaitEnded = (subject: string): Effect.Effect<void> =>
  publishOperationEvent((seq, atMs) => ({ _tag: "WaitEnded", seq, atMs, subject }));

/**
 * The unit whose run is in progress, so nested producers (a download inside a
 * step) can attribute continuous progress without threading identifiers.
 */
export class CurrentOperationUnit extends ServiceMap.Service<
  CurrentOperationUnit,
  { readonly unitId: string }
>()("@agentxm/workspace-operations/plan/operation-events/CurrentOperationUnit") {}

/**
 * Publish a continuous measurement for the current unit. Producers throttle
 * before calling: a download publishes tens of events, never one per chunk.
 * No-op without a broadcast or without a current unit.
 */
export const publishUnitProgress = (progress: {
  readonly done: number;
  readonly total?: number | undefined;
  readonly unit: ProgressUnit;
}): Effect.Effect<void> =>
  Effect.flatMap(Effect.serviceOption(CurrentOperationUnit), (unit) =>
    Option.isNone(unit)
      ? Effect.void
      : publishOperationEvent((seq, atMs) => ({
          _tag: "UnitProgress",
          seq,
          atMs,
          unitId: unit.value.unitId,
          done: progress.done,
          ...(progress.total === undefined ? {} : { total: progress.total }),
          unit: progress.unit,
        })),
  );

/**
 * Time-gated progress publisher for a producer loop: at most one event per
 * `intervalMs` of wall clock, plus the final measurement when `done` reaches
 * `total`. Keeps continuous measurements to tens of events per unit.
 */
export const makeThrottledUnitProgress = (options: {
  readonly unit: ProgressUnit;
  readonly intervalMs?: number | undefined;
}): Effect.Effect<(done: number, total?: number | undefined) => Effect.Effect<void>> =>
  Effect.map(
    Ref.make(-Infinity),
    (last) => (done: number, total?: number | undefined) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        const previous = yield* Ref.get(last);
        const final = total !== undefined && done >= total;
        if (!final && now - previous < (options.intervalMs ?? 100)) return;
        yield* Ref.set(last, now);
        yield* publishUnitProgress({ done, unit: options.unit, total });
      }),
  );

export interface ObservedUnit {
  readonly id: string;
  readonly label: string;
  /** Planned position; assigned by the service when the caller has none. */
  readonly index?: number | undefined;
  readonly total?: number | undefined;
  readonly parentUnitId?: string | undefined;
}

const unitStateForExit = (exit: Exit.Exit<unknown, unknown>): UnitState =>
  Exit.isSuccess(exit)
    ? "committed"
    : Cause.hasInterruptsOnly(exit.cause)
      ? "interrupted"
      : "failed";

/**
 * Run one unit of work under the lifecycle: `UnitStarted` before, then
 * `UnitResolved` with the state the exit proves (`committed`, `failed`, or
 * `interrupted`). The unit identity is provided to the run so nested producers
 * can publish progress. No-op wrapper without a broadcast.
 */
export const observeUnit = <A, E, R>(
  unit: ObservedUnit,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.flatMap(Effect.serviceOption(OperationLifecycle), (service) => {
    if (Option.isNone(service)) return effect;
    const lifecycle = service.value;
    return Effect.gen(function* () {
      const index = unit.index ?? (yield* lifecycle.nextUnitIndex);
      const total = unit.total === undefined ? {} : { total: unit.total };
      yield* lifecycle.publish((seq, atMs) => ({
        _tag: "UnitStarted",
        seq,
        atMs,
        unitId: unit.id,
        label: unit.label,
        index,
        ...total,
        ...(unit.parentUnitId === undefined ? {} : { parentUnitId: unit.parentUnitId }),
      }));
      return yield* effect.pipe(
        Effect.provideService(CurrentOperationUnit, { unitId: unit.id }),
        Effect.onExit((exit) =>
          lifecycle.publish((seq, atMs) => ({
            _tag: "UnitResolved",
            seq,
            atMs,
            unitId: unit.id,
            label: unit.label,
            state: unitStateForExit(exit),
            index,
            ...total,
          })),
        ),
      );
    });
  });

/** Publish the terminal event once. No-op without a broadcast. */
export const settleOperation = (outcome: SettledOutcome): Effect.Effect<void> =>
  withLifecycle(
    (service) => service.settle(outcome),
    () => Effect.void,
  );

/**
 * Wait until every lossless subscriber has consumed the terminal event.
 * Returns immediately when no broadcast is provided or the operation has not
 * settled, so callers cannot deadlock on an operation that never ends.
 */
export const awaitDrained: Effect.Effect<void> = withLifecycle(
  (service) =>
    Effect.flatMap(service.settled, (settled) => (settled ? service.drained.await : Effect.void)),
  () => Effect.void,
);

// -----------------------------------------------------------------------------
// Subscribers
// -----------------------------------------------------------------------------

/**
 * Subscribe to the broadcast within the current scope. The subscription is
 * created immediately — before this effect returns — so events published
 * afterwards are never missed; the stream ends with the terminal event.
 */
export const lifecycleEvents = (
  service: OperationLifecycleService,
): Effect.Effect<Stream.Stream<OperationEvent>, never, Scope.Scope> =>
  Effect.map(PubSub.subscribe(service.events), (subscription) =>
    Stream.fromSubscription(subscription).pipe(
      Stream.takeUntil((event) => event._tag === "OperationSettled"),
    ),
  );

/**
 * Fork a subscriber that observes every event through settlement and holds
 * the drain latch until it has processed the terminal event. The subscription
 * attaches before this effect returns. No-op when no broadcast is provided.
 */
export const subscribeLossless = (
  service: OperationLifecycleService,
  observe: (event: OperationEvent) => Effect.Effect<void>,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function* () {
    const ack = yield* service.registerLossless;
    const stream = yield* lifecycleEvents(service);
    yield* stream.pipe(Stream.runForEach(observe), Effect.ensuring(ack), Effect.forkScoped);
  });
