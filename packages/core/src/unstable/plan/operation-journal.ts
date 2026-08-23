/**
 * Operation journal — the invocation-scoped record of a plan-family
 * operation's progress.
 *
 * The resolution boundary writes the frozen candidate's facts at apply start
 * and appends each completed unit as it terminates. When an external
 * termination request interrupts the invocation, the lifecycle wrapper reads
 * this journal to resolve the interruption truthfully: which units committed,
 * which were prevented, and what the durable-state disposition is.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as ServiceMap from "effect/Context";

import type { CompletedJobStep, OperationPresentation, PlanRiskCondition } from "./plan.js";
import type { ReleaseAgeOperationEvidence } from "../registry/index.js";
import type { OperationPrecondition } from "./plan.js";
import type { OperationAtomicity, ResolvedUnit } from "./operation-resolution.js";

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
  /** Units completed so far during apply, in execution order. */
  readonly completed: ReadonlyArray<CompletedJobStep<unknown>>;
  /** True while the apply runs inside a restoring (candidate-atomic) guard. */
  readonly restoresOnFailure: boolean;
  /** True once apply has begun. */
  readonly applying: boolean;
}

export interface OperationJournalService {
  readonly ref: Ref.Ref<Option.Option<OperationJournalState>>;
}

export class OperationJournal extends ServiceMap.Service<
  OperationJournal,
  OperationJournalService
>()("@agentxm/client-core/unstable/plan/operation-journal/OperationJournal") {}

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

/** Append one completed unit to the journal. */
export const appendCompletedUnit = (step: CompletedJobStep<unknown>): Effect.Effect<void> =>
  updateOperationJournal((state) => ({ ...state, completed: [...state.completed, step] }));

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
