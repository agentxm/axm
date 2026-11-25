import { CurrentWorkObserver } from "@agentxm/host-primitives/work-observation";
import * as Effect from "effect/Effect";
import {
  publishPhaseStarted,
  type OperationJournal,
  recordJournalPhase,
  type OperationPhase,
} from "../../operations/index.js";

/** Publish a phase transition to the lifecycle stream and the journal. */
export const enterPhase = (phase: OperationPhase): Effect.Effect<void, never, OperationJournal> =>
  publishPhaseStarted(phase).pipe(Effect.andThen(recordJournalPhase(phase)));

/** The executing effect owns the phase interval; lifecycle events remain projections. */
export const withPhaseSpan = <A, E, R>(phase: OperationPhase, effect: Effect.Effect<A, E, R>) =>
  Effect.flatMap(CurrentWorkObserver, (observer) =>
    observer === undefined
      ? effect
      : effect.pipe(
          Effect.withSpan(
            "axm.operation.phase",
            { attributes: { "axm.operation.phase": phase } },
            { captureStackTrace: false },
          ),
        ),
  );
