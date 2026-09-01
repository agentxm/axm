/**
 * Operation journal — the invocation-scoped record of a plan-family
 * operation's progress.
 *
 * The resolution boundary writes the frozen candidate's facts at planning,
 * records each phase transition, and records per-unit started and resolved
 * facts as execution reaches them — settlement is recorded before the next
 * interruptible boundary. When an external termination request interrupts the
 * invocation, the lifecycle wrapper reads this journal to resolve the
 * interruption truthfully: which units settled, which were in flight, which
 * were never attempted, and what the durable-state disposition of each is.
 * The journal is invocation-local; nothing here persists past the process.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as ServiceMap from "effect/Context";

import type { CompletedJobStep, OperationPresentation, PlanRiskCondition } from "./plan.js";
import type { ReleaseAgeOperationEvidence } from "@agentxm/registry-protocol/unstable/registry/release-age-policy";
import type { OperationPrecondition } from "./plan.js";
import type { OperationAtomicity, OperationPhase, ResolvedUnit } from "./operation-resolution.js";

export interface OperationJournalState {
  readonly name: string;
  readonly description: Option.Option<string>;
  readonly mode: "preview" | "apply";
  readonly candidateId?: string;
  readonly atomicity: OperationAtomicity;
  readonly presentation?: OperationPresentation;
  readonly releaseAge?: ReleaseAgeOperationEvidence;
  readonly preconditions?: ReadonlyArray<OperationPrecondition>;
  readonly riskConditions?: ReadonlyArray<PlanRiskCondition>;
  /** Units of the frozen candidate, in planned states. */
  readonly plannedUnits: ReadonlyArray<ResolvedUnit<unknown>>;
  /** The lifecycle phase the invocation had reached when last recorded. */
  readonly phase: OperationPhase;
  /** Ids of units whose run began, in start order. */
  readonly startedUnitIds: ReadonlyArray<string>;
  /**
   * Settlement facts, recorded the moment each unit resolved — before any
   * interruptible boundary — in execution order. A started unit missing here
   * is in flight: its durable effects are restored by the closure's rollback
   * or unknown, never "not attempted".
   */
  readonly resolved: ReadonlyArray<CompletedJobStep<unknown>>;
  /** True while the apply runs inside a restoring (closure-atomic) guard. */
  readonly restoresOnFailure: boolean;
}

export interface OperationJournalService {
  readonly ref: Ref.Ref<Option.Option<OperationJournalState>>;
}

export class OperationJournal extends ServiceMap.Service<
  OperationJournal,
  OperationJournalService
>()("@agentxm/extension-management/unstable/plan/operation-journal/OperationJournal") {}

/** Record the operation's frozen facts. No-op when no journal is provided. */
export const recordOperationJournal = (state: OperationJournalState): Effect.Effect<void> =>
  Effect.gen(function* () {
    const service = yield* Effect.serviceOption(OperationJournal);
    if (Option.isNone(service)) return;
    yield* Ref.set(service.value.ref, Option.some(state));
  });

/** Merge updates onto the recorded state. No-op when nothing was recorded. */
export const updateOperationJournal = (
  update: (state: OperationJournalState) => OperationJournalState,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const service = yield* Effect.serviceOption(OperationJournal);
    if (Option.isNone(service)) return;
    yield* Ref.update(service.value.ref, Option.map(update));
  });

/** Record the lifecycle phase the invocation has entered. */
export const recordJournalPhase = (phase: OperationPhase): Effect.Effect<void> =>
  updateOperationJournal((state) => ({ ...state, phase }));

/** Record that a unit's run began. */
export const appendStartedUnit = (unitId: string): Effect.Effect<void> =>
  updateOperationJournal((state) => ({
    ...state,
    startedUnitIds: [...state.startedUnitIds, unitId],
  }));

/** Record one unit's settlement fact. */
export const appendResolvedUnit = (step: CompletedJobStep<unknown>): Effect.Effect<void> =>
  updateOperationJournal((state) => ({ ...state, resolved: [...state.resolved, step] }));

export const getOperationJournal: Effect.Effect<Option.Option<OperationJournalState>> = Effect.gen(
  function* () {
    const service = yield* Effect.serviceOption(OperationJournal);
    if (Option.isNone(service)) return Option.none();
    return yield* Ref.get(service.value.ref);
  },
);

export const makeOperationJournal: Effect.Effect<OperationJournalService> = Ref.make(
  Option.none<OperationJournalState>(),
).pipe(Effect.map((ref) => ({ ref })));
