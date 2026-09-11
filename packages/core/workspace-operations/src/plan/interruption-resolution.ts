/**
 * The terminal resolution of an interrupted operation.
 *
 * Interruption is the one lifecycle fact the operation body cannot settle for
 * itself: the signal arrives from outside it. Turning the operation journal
 * into a contract-valid resolution — which closures settled, which were in
 * flight, what durable state is retained, and which atomicity class actually
 * held — is execution semantics, so it lives beside closure execution rather
 * than in a transport adapter. The caller supplies only the resume command it
 * would print, because how an operator re-runs a request is a property of the
 * surface that accepted it.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Option from "effect/Option";
import * as OptionModule from "effect/Option";

import {
  executedUnits,
  makeOperationResolution,
  unitIdOf,
  type AtomicityClass,
  type OperationRecovery,
  type OperationResolution,
  type ResolvedUnit,
} from "./operation-resolution.js";
import type { OperationPresentation } from "./plan.js";
import type { OperationJournalState } from "./operation-journal.js";

/** What the invoking surface knows about a request the signal cut short. */
export interface InterruptedInvocation {
  /** Operation name for a resolution produced before planning completed. */
  readonly planName: string;
  readonly mode: "preview" | "apply";
  /**
   * The command family's statically declared atomicity, for a resolution
   * produced before the journal exists. Defaults to `closure-atomic`.
   */
  readonly declaredAtomicity?: AtomicityClass;
  readonly presentation?: OperationPresentation;
  /** The command an operator re-runs to continue; the surface renders it. */
  readonly replayCommand: string;
}

/** One durable path the footprint recorder observed before the signal landed. */
export interface ObservedFootprintEntry {
  readonly path: string;
  readonly change: "created" | "modified" | "removed" | "restored";
}

/**
 * Derive the terminal resolution for an externally interrupted invocation.
 *
 * Before the journal exists nothing was planned or attempted: the resolution
 * carries the requested mode and the command family's declared atomicity,
 * never a hardcoded apply/closure-atomic claim. Once apply has begun, settled
 * closures keep their settlement — a commit stands as retained durable state,
 * and a failure of a restoring apply had already rolled back only its own
 * closure — while a unit that started without a settlement fact is reported
 * `interrupted`, never as not attempted.
 */
export const resolveInterruption = (
  invocation: InterruptedInvocation,
  journal: Option.Option<OperationJournalState>,
  signal: "SIGINT" | "SIGTERM",
  footprint: ReadonlyArray<ObservedFootprintEntry>,
): OperationResolution<unknown> => {
  const observedFootprint = footprint.length === 0 ? {} : { footprint };
  if (OptionModule.isNone(journal)) {
    return makeOperationResolution<unknown>({
      name: invocation.planName,
      description: OptionModule.none(),
      mode: invocation.mode,
      atomicity: {
        declared: invocation.declaredAtomicity ?? "closure-atomic",
        // Nothing was attempted, so no durable effect was made or retained.
        applied: "closure-atomic",
      },
      units: [],
      presentation: invocation.presentation,
      interruption: { signal, disposition: "none" },
      ...observedFootprint,
    });
  }
  const state = journal.value;
  const applying = state.phase === "apply" || state.phase === "restoration";
  if (!applying) {
    // Planning, preview, confirmation, or validation: nothing was attempted
    // and the planned units stand as planned.
    return makeOperationResolution<unknown>({
      name: state.name,
      description: state.description,
      mode: state.mode,
      candidateId: state.candidateId,
      atomicity: { declared: state.atomicity.declared, applied: "closure-atomic" },
      units: state.plannedUnits,
      presentation: state.presentation ?? invocation.presentation,
      releaseAge: state.releaseAge,
      preconditions: state.preconditions,
      riskConditions: state.riskConditions,
      interruption: { signal, disposition: "none" },
      ...observedFootprint,
    });
  }
  const resolvedUnits = executedUnits({
    _tag: "ExecutedPlan",
    name: state.name,
    description: state.description,
    jobs: [{ concurrency: 1, steps: state.resolved }],
  });
  // Closures settle independently: a settled commit stands as retained
  // durable state regardless of the interruption, and a settled failure of a
  // restoring apply had already rolled back only its own closure.
  const settledUnits = resolvedUnits.map((unit) =>
    unit.state === "committed"
      ? { ...unit, disposition: "retained" as const }
      : unit.state === "failed" && state.restoresOnFailure
        ? { ...unit, disposition: "restored" as const }
        : unit,
  );
  const resolvedIds = new Set(state.resolved.map((step) => unitIdOf(step)));
  const startedIds = new Set(state.startedUnitIds);
  // A started unit missing a settlement fact was in flight at the stopping
  // point: its effects were restored by the closure's rollback, or their
  // settlement was simply not observed — never "not attempted".
  const inFlight: ReadonlyArray<ResolvedUnit<unknown>> = state.plannedUnits
    .filter((unit) => startedIds.has(unit.id) && !resolvedIds.has(unit.id))
    .map((unit) => ({
      ...unit,
      state: "interrupted",
      disposition: state.restoresOnFailure ? "restored" : "unknown",
      message: state.restoresOnFailure
        ? "interrupted while in flight; effects were restored"
        : "interrupted while in flight; settlement was not observed",
    }));
  const notStarted: ReadonlyArray<ResolvedUnit<unknown>> = state.plannedUnits
    .filter((unit) => !startedIds.has(unit.id) && !resolvedIds.has(unit.id))
    .map((unit) => ({
      ...unit,
      state: "blocked",
      message: "not attempted: the operation was interrupted",
      blocking: {
        class: "operation-aborted",
        subject: unit.id,
        phase: "apply",
        detail: "not attempted: the operation was interrupted",
        reference: "interruption",
      },
    }));
  const units = [...settledUnits, ...inFlight, ...notStarted];
  const committed = settledUnits.filter((unit) => unit.state === "committed");
  // Unknown dominates — durable state may exist beyond what settled. With
  // everything settled or restored, retained commits are the headline;
  // restored in-flight work without commits reports restored.
  const disposition =
    inFlight.length > 0 && !state.restoresOnFailure
      ? "unknown"
      : committed.length > 0
        ? "retained"
        : inFlight.length > 0 || (state.resolved.length > 0 && state.restoresOnFailure)
          ? "restored"
          : "none";
  const recovery: OperationRecovery | undefined =
    disposition === "retained" || disposition === "unknown"
      ? {
          retained: committed.flatMap((unit) =>
            unit.artifact === undefined ? [unit.id] : [unit.artifact.path],
          ),
          actions: [
            {
              description: "Re-run the command to continue the remaining units.",
              cmd: invocation.replayCommand,
            },
          ],
        }
      : undefined;
  return makeOperationResolution<unknown>({
    name: state.name,
    description: state.description,
    mode: state.mode,
    candidateId: state.candidateId,
    atomicity: {
      declared: state.atomicity.declared,
      // A restoring apply keeps its closure-atomic promise: settled commits
      // stand and everything else was restored. Only unobserved settlement
      // or non-rollbackable retention downgrade the applied class.
      applied: state.restoresOnFailure
        ? "closure-atomic"
        : disposition === "retained" || disposition === "unknown"
          ? "non-rollbackable"
          : "closure-atomic",
    },
    units,
    presentation: state.presentation ?? invocation.presentation,
    releaseAge: state.releaseAge,
    preconditions: state.preconditions,
    riskConditions: state.riskConditions,
    interruption: { signal, disposition },
    recovery,
    ...observedFootprint,
  });
};
