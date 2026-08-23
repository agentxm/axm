/**
 * Operation resolution — the single truthful value every plan-family command
 * terminates with.
 *
 * One `OperationResolution` is produced at every termination path of a
 * plan-family invocation (preview, blocked, cancelled, applied, partial,
 * failed, interrupted). The operation outcome is a pure derivation over the
 * unit terminal multiset and the operation-level events the value carries, and
 * the exit code is a pure mapping from that outcome. Every channel — machine
 * document, human render, telemetry — projects this value; none re-derives its
 * own account of what happened.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { ExitCode, exitCodeFor, type AppError, type AppErrorCode } from "../app-error/index.js";
import type { ReleaseAgeOperationEvidence } from "../registry/index.js";
import type { SuggestedAction } from "../cli-runtime/suggested-action.js";
import type {
  BlockingClass,
  ConfiguredAgentOutcome,
  ExecutedPlan,
  Job,
  JobStepArtifact,
  OperationPrecondition,
  OperationPresentation,
  PlanRiskCondition,
  PlannedJobStep,
  RegistryLifecycleEvidence,
} from "./plan.js";

// -----------------------------------------------------------------------------
// Canonical vocabulary
// -----------------------------------------------------------------------------

/**
 * Canonical unit states. `planned` and `ready` are pre-terminal and appear only
 * in preview-mode and not-executed resolutions; the rest are terminal.
 * Warnings annotate a state and are never a state of their own.
 */
export const UnitStateSchema = Schema.Literals([
  "planned",
  "ready",
  "committed",
  "unchanged",
  "failed",
  "rolled-back",
  "blocked",
  "skipped",
  "cancelled",
] as const).annotate({
  identifier: "UnitState",
  title: "Unit State",
  description: "Canonical lifecycle state of one unit of work.",
});
export type UnitState = typeof UnitStateSchema.Type;

/** Lifecycle phase in which an operation event (blocking, waiting) occurred. */
export const OperationPhaseSchema = Schema.Literals([
  "planning",
  "preview",
  "confirmation",
  "validation",
  "apply",
  "restoration",
] as const).annotate({
  identifier: "OperationPhase",
  title: "Operation Phase",
  description: "Lifecycle phase of a plan-family operation.",
});
export type OperationPhase = typeof OperationPhaseSchema.Type;

/** Canonical operation terminal outcomes. */
export const OperationOutcomeSchema = Schema.Literals([
  "previewed",
  "applied",
  "no-op",
  "partial",
  "failed",
  "blocked",
  "cancelled",
  "interrupted",
  "recovery-required",
] as const).annotate({
  identifier: "OperationOutcome",
  title: "Operation Outcome",
  description: "Canonical terminal outcome of a plan-family operation.",
});
export type OperationOutcome = typeof OperationOutcomeSchema.Type;

/** Atomicity class that a closure declares and that an execution applies. */
export const AtomicityClassSchema = Schema.Literals([
  "candidate-atomic",
  "non-rollbackable",
] as const).annotate({
  identifier: "AtomicityClass",
  title: "Atomicity Class",
  description: "Failure-atomicity class of an operation's durable effects.",
});
export type AtomicityClass = typeof AtomicityClassSchema.Type;

/** Post-termination disposition of one unit's durable effects. */
export const UnitDispositionSchema = Schema.Literals([
  "restored",
  "retained",
  "untouched",
] as const).annotate({
  identifier: "UnitDisposition",
  title: "Unit Disposition",
  description: "What became of a unit's durable effects after termination.",
});
export type UnitDisposition = typeof UnitDispositionSchema.Type;

// -----------------------------------------------------------------------------
// Typed blocking
// -----------------------------------------------------------------------------

/**
 * A typed blocking condition: what class of condition prevented work, which
 * subject it blocked, in which phase it was determined, and — where one exists
 * — the machine-readable escape that resolves it.
 */
export interface OperationBlock {
  readonly class: BlockingClass;
  readonly subject: string;
  readonly phase: OperationPhase;
  readonly detail: string;
  /**
   * Cause class carried for blocking classes whose exit is not pinned by the
   * class alone (`precondition-unmet`, `external-blocked`).
   */
  readonly causeCode?: AppErrorCode;
  /** Machine-readable reference to what blocked the subject. */
  readonly reference?: string;
  readonly escape?: SuggestedAction;
}

// -----------------------------------------------------------------------------
// Units
// -----------------------------------------------------------------------------

export interface ResolvedUnit<Output = never> {
  /** Stable identity: the planned step key where one exists, else the label. */
  readonly id: string;
  readonly label: string;
  readonly state: UnitState;
  /** Present on units of a failed or interrupted closure. */
  readonly disposition?: UnitDisposition;
  /** Present exactly when `state` is `blocked`. */
  readonly blocking?: OperationBlock;
  readonly message?: string;
  /** Annotations on the state, never a state of their own. */
  readonly warnings?: ReadonlyArray<string>;
  readonly error?: AppError;
  readonly artifact?: JobStepArtifact;
  readonly agentOutcomes?: ReadonlyArray<ConfiguredAgentOutcome>;
  readonly registryLifecycle?: RegistryLifecycleEvidence;
  readonly links?: { readonly html: string };
  readonly output?: Output;
}

// -----------------------------------------------------------------------------
// Operation-level events and evidence
// -----------------------------------------------------------------------------

export interface OperationInterruption {
  readonly signal: "SIGINT" | "SIGTERM";
  /** Durable-state disposition of in-flight work at the stopping point. */
  readonly disposition: "restored" | "retained" | "none";
}

/** One observed durable change or restoration. */
export interface OperationFootprintEntry {
  readonly path: string;
  readonly change: "created" | "modified" | "removed" | "restored";
}

/**
 * Machine-readable recovery content: what durable state remains and what
 * action resolves it. `blocksNormalOperation` is true only when a normal
 * re-invocation cannot safely proceed without the named action — that is what
 * turns the outcome into `recovery-required` rather than recovery content
 * accompanying `partial` or `interrupted`.
 */
export interface OperationRecovery {
  readonly blocksNormalOperation: boolean;
  readonly retained: ReadonlyArray<string>;
  readonly actions: ReadonlyArray<SuggestedAction>;
  readonly recordPath?: string;
}

// -----------------------------------------------------------------------------
// The resolution
// -----------------------------------------------------------------------------

export interface OperationAtomicity {
  /** The class the operation's closures declared. */
  readonly declared: AtomicityClass;
  /**
   * The class that actually applied to durable effects: `candidate-atomic`
   * when effects were fully restored or never made; `non-rollbackable` when
   * effects were retained, by design or because restoration failed.
   */
  readonly applied: AtomicityClass;
}

export interface OperationResolution<Output = never> {
  readonly _tag: "OperationResolution";
  readonly name: string;
  readonly description: Option.Option<string>;
  readonly mode: "preview" | "apply";
  readonly candidateId?: string;
  readonly atomicity: OperationAtomicity;
  readonly units: ReadonlyArray<ResolvedUnit<Output>>;
  /** The user declined a required confirmation before any mutation. */
  readonly declined?: boolean;
  /** Operation-level typed blocking; nothing was attempted. */
  readonly blocking?: OperationBlock;
  /** Operation-level failure cause, carrying the cause class for the exit. */
  readonly failure?: AppError;
  readonly interruption?: OperationInterruption;
  /** A flag-requested divergence check found divergence on a preview. */
  readonly divergence?: boolean;
  /** Observed durable footprint reported by the mutation layers. */
  readonly footprint?: ReadonlyArray<OperationFootprintEntry>;
  readonly recovery?: OperationRecovery;
  readonly presentation?: OperationPresentation;
  readonly releaseAge?: ReleaseAgeOperationEvidence;
  readonly preconditions?: ReadonlyArray<OperationPrecondition>;
  readonly riskConditions?: ReadonlyArray<PlanRiskCondition>;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
}

// -----------------------------------------------------------------------------
// Pure derivations: outcome, counts, exit code, ok
// -----------------------------------------------------------------------------

export interface UnitStateCounts {
  readonly total: number;
  readonly planned: number;
  readonly ready: number;
  readonly committed: number;
  readonly unchanged: number;
  readonly failed: number;
  readonly rolledBack: number;
  readonly blocked: number;
  readonly skipped: number;
  readonly cancelled: number;
  /** Annotation count, outside the state partition. */
  readonly warnings: number;
}

export const countUnitStates = (units: ReadonlyArray<ResolvedUnit<unknown>>): UnitStateCounts => {
  let planned = 0;
  let ready = 0;
  let committed = 0;
  let unchanged = 0;
  let failed = 0;
  let rolledBack = 0;
  let blocked = 0;
  let skipped = 0;
  let cancelled = 0;
  let warnings = 0;
  for (const unit of units) {
    warnings += unit.warnings?.length ?? 0;
    switch (unit.state) {
      case "planned":
        planned += 1;
        break;
      case "ready":
        ready += 1;
        break;
      case "committed":
        committed += 1;
        break;
      case "unchanged":
        unchanged += 1;
        break;
      case "failed":
        failed += 1;
        break;
      case "rolled-back":
        rolledBack += 1;
        break;
      case "blocked":
        blocked += 1;
        break;
      case "skipped":
        skipped += 1;
        break;
      case "cancelled":
        cancelled += 1;
        break;
    }
  }
  return {
    total: units.length,
    planned,
    ready,
    committed,
    unchanged,
    failed,
    rolledBack,
    blocked,
    skipped,
    cancelled,
    warnings,
  };
};

/**
 * The operation outcome, derived — never decided — from the resolution's
 * operation-level events and its unit terminal multiset:
 *
 * - an external termination request resolves `interrupted`;
 * - durable state a normal re-run cannot safely continue from resolves
 *   `recovery-required`;
 * - a typed blocking condition that prevented execution resolves `blocked`;
 * - a declined confirmation resolves `cancelled`;
 * - preview mode resolves `previewed`;
 * - otherwise the multiset decides: restored work is `failed` (with its
 *   rollback report), surviving commits plus failures are `partial`, commits
 *   alone are `applied`, and zero state-changing effects are `no-op`.
 */
export const deriveOperationOutcome = (
  resolution: OperationResolution<unknown>,
): OperationOutcome => {
  if (resolution.interruption !== undefined) return "interrupted";
  if (resolution.recovery?.blocksNormalOperation === true) return "recovery-required";
  if (resolution.blocking !== undefined) return "blocked";
  if (resolution.declined === true) return "cancelled";
  if (resolution.mode === "preview") return "previewed";
  const counts = countUnitStates(resolution.units);
  if (counts.rolledBack > 0) return "failed";
  const attemptedFailures = counts.failed + counts.blocked;
  const operationFailed = resolution.failure !== undefined;
  if (counts.committed > 0) {
    return attemptedFailures > 0 || operationFailed ? "partial" : "applied";
  }
  if (attemptedFailures > 0 || operationFailed) return "failed";
  return "no-op";
};

const BLOCKED_CONFLICT_CLASSES: ReadonlySet<BlockingClass> = new Set([
  "stale-candidate",
  "resource-conflict",
  "policy-excluded",
  "dependency-cycle",
]);

/**
 * The exit code for a resolution, from one outcome-to-exit mapping:
 * previewed/applied/no-op/cancelled exit 0 (a flag-requested divergence on a
 * preview exits 1); partial exits 1; failed exits by cause class (default 1);
 * blocked exits by blocking class (approval/override 2; stale-candidate,
 * resource-conflict, policy-excluded, dependency-cycle 6; otherwise cause
 * class); interrupted exits 130/143; recovery-required exits 6.
 */
export const operationExitCode = (
  resolution: OperationResolution<unknown>,
  outcome: OperationOutcome = deriveOperationOutcome(resolution),
): number => {
  switch (outcome) {
    case "previewed":
      return resolution.divergence === true ? ExitCode.Issues : ExitCode.Success;
    case "applied":
    case "no-op":
    case "cancelled":
      return ExitCode.Success;
    case "partial":
      return ExitCode.Issues;
    case "failed":
      return exitCodeFor(resolution.failure?.code ?? "issues");
    case "blocked": {
      const blocking = resolution.blocking;
      if (blocking === undefined) return ExitCode.Issues;
      if (blocking.class === "approval-required" || blocking.class === "override-required") {
        return ExitCode.Usage;
      }
      if (BLOCKED_CONFLICT_CLASSES.has(blocking.class)) return ExitCode.Conflict;
      return exitCodeFor(blocking.causeCode ?? resolution.failure?.code ?? "issues");
    }
    case "interrupted":
      return resolution.interruption?.signal === "SIGTERM" ? 143 : 130;
    case "recovery-required":
      return ExitCode.Conflict;
  }
};

/** The machine envelope's `ok`: true exactly for the zero-exit outcome set. */
export const operationOk = (
  resolution: OperationResolution<unknown>,
  outcome: OperationOutcome = deriveOperationOutcome(resolution),
): boolean => operationExitCode(resolution, outcome) === ExitCode.Success;

// -----------------------------------------------------------------------------
// Unit construction from plan machinery
// -----------------------------------------------------------------------------

export const unitIdOf = (step: { readonly key?: string; readonly label: string }): string =>
  step.key ?? step.label;

/** Units of a plan that was not executed: planned readiness, typed blocking. */
export const plannedUnits = <Requirements, Output>(
  jobs: ReadonlyArray<Job<Requirements, Output>>,
): ReadonlyArray<ResolvedUnit<Output>> =>
  jobs.flatMap((job) =>
    job.steps.map((step: PlannedJobStep<Requirements, Output>): ResolvedUnit<Output> => {
      const base = {
        id: unitIdOf(step),
        label: step.label,
        ...(step.artifact === undefined ? {} : { artifact: step.artifact }),
        ...(step.agentOutcomes === undefined ? {} : { agentOutcomes: step.agentOutcomes }),
        ...(step.registryLifecycle === undefined
          ? {}
          : { registryLifecycle: step.registryLifecycle }),
      };
      switch (step.readiness) {
        case "ready":
          return {
            ...base,
            state: "ready",
            ...(step.message === undefined || step.message.length === 0
              ? {}
              : { message: step.message }),
          };
        case "warn":
          return { ...base, state: "ready", warnings: [step.warnMessage] };
        case "error":
          return {
            ...base,
            state: "blocked",
            message: step.errorMessage,
            blocking: {
              class: "precondition-unmet",
              subject: unitIdOf(step),
              phase: "planning",
              detail: step.errorMessage,
              ...(step.blockingConditionIds !== undefined && step.blockingConditionIds.length > 0
                ? { reference: step.blockingConditionIds[0] }
                : {}),
            },
          };
      }
    }),
  );

/**
 * Units of an executed plan. `restored: true` marks the candidate-atomic
 * failure path where every committed effect was rolled back.
 */
export const executedUnits = <Output>(
  executed: ExecutedPlan<Output>,
  options?: { readonly restored?: boolean },
): ReadonlyArray<ResolvedUnit<Output>> =>
  executed.jobs.flatMap((job) =>
    job.steps.map((step): ResolvedUnit<Output> => {
      const base = {
        id: unitIdOf(step),
        label: step.label,
        ...(step.agentOutcomes === undefined ? {} : { agentOutcomes: step.agentOutcomes }),
        ...(step.registryLifecycle === undefined
          ? {}
          : { registryLifecycle: step.registryLifecycle }),
      };
      if (step.result.result === "success") {
        const success = {
          ...base,
          ...(step.result.message.length === 0 ? {} : { message: step.result.message }),
          ...(step.result.warnings !== undefined && step.result.warnings.length > 0
            ? { warnings: step.result.warnings }
            : {}),
          ...(step.result.artifact === undefined ? {} : { artifact: step.result.artifact }),
          ...(step.result.links === undefined ? {} : { links: step.result.links }),
          ...(step.result.output === undefined ? {} : { output: step.result.output }),
        };
        if (step.result.disposition === "skipped") {
          return { ...success, state: "skipped" };
        }
        if (
          step.result.disposition === "unchanged" ||
          step.result.artifact?.change === "unchanged"
        ) {
          return { ...success, state: "unchanged" };
        }
        if (options?.restored === true) {
          return { ...success, state: "rolled-back", disposition: "restored" };
        }
        return { ...success, state: "committed" };
      }
      const failureBase = {
        ...base,
        message: step.result.message,
        error: step.result.error,
      };
      const blocking = step.result.blocking;
      if (blocking !== undefined) {
        return {
          ...failureBase,
          state: "blocked",
          ...(options?.restored === true ? { disposition: "untouched" as const } : {}),
          blocking: {
            class: blocking.class,
            subject: unitIdOf(step),
            phase: "apply",
            detail: step.result.message,
            ...(blocking.reference === undefined ? {} : { reference: blocking.reference }),
          },
        };
      }
      return {
        ...failureBase,
        state: "failed",
        ...(options?.restored === true ? { disposition: "restored" as const } : {}),
      };
    }),
  );

/**
 * Stable-identity ordering for machine documents. Code-unit comparison, not
 * locale collation, so the order is identical on every host.
 */
export const unitsByStableIdentity = <Output>(
  units: ReadonlyArray<ResolvedUnit<Output>>,
): ReadonlyArray<ResolvedUnit<Output>> =>
  [...units].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

// -----------------------------------------------------------------------------
// Construction helper
// -----------------------------------------------------------------------------

export interface MakeOperationResolutionArgs<Output> {
  readonly name: string;
  readonly description: Option.Option<string>;
  readonly mode: "preview" | "apply";
  readonly atomicity: OperationAtomicity;
  readonly units: ReadonlyArray<ResolvedUnit<Output>>;
  readonly candidateId?: string | undefined;
  readonly declined?: boolean | undefined;
  readonly blocking?: OperationBlock | undefined;
  readonly failure?: AppError | undefined;
  readonly interruption?: OperationInterruption | undefined;
  readonly divergence?: boolean | undefined;
  readonly footprint?: ReadonlyArray<OperationFootprintEntry> | undefined;
  readonly recovery?: OperationRecovery | undefined;
  readonly presentation?: OperationPresentation | undefined;
  readonly releaseAge?: ReleaseAgeOperationEvidence | undefined;
  readonly preconditions?: ReadonlyArray<OperationPrecondition> | undefined;
  readonly riskConditions?: ReadonlyArray<PlanRiskCondition> | undefined;
  readonly suggestions?: ReadonlyArray<SuggestedAction> | undefined;
}

export const makeOperationResolution = <Output = never>(
  args: MakeOperationResolutionArgs<Output>,
): OperationResolution<Output> => ({
  _tag: "OperationResolution",
  name: args.name,
  description: args.description,
  mode: args.mode,
  atomicity: args.atomicity,
  units: args.units,
  ...(args.candidateId === undefined ? {} : { candidateId: args.candidateId }),
  ...(args.declined === undefined ? {} : { declined: args.declined }),
  ...(args.blocking === undefined ? {} : { blocking: args.blocking }),
  ...(args.failure === undefined ? {} : { failure: args.failure }),
  ...(args.interruption === undefined ? {} : { interruption: args.interruption }),
  ...(args.divergence === undefined ? {} : { divergence: args.divergence }),
  ...(args.footprint === undefined ? {} : { footprint: args.footprint }),
  ...(args.recovery === undefined ? {} : { recovery: args.recovery }),
  ...(args.presentation === undefined ? {} : { presentation: args.presentation }),
  ...(args.releaseAge === undefined ? {} : { releaseAge: args.releaseAge }),
  ...(args.preconditions === undefined ? {} : { preconditions: args.preconditions }),
  ...(args.riskConditions === undefined ? {} : { riskConditions: args.riskConditions }),
  ...(args.suggestions === undefined ? {} : { suggestions: args.suggestions }),
});

/** The atomicity class a plan declares; local plans default candidate-atomic. */
export const declaredAtomicity = (plan: {
  readonly executionCapabilities?: { readonly rollback: "local-atomic" | "non-rollbackable" };
}): AtomicityClass =>
  plan.executionCapabilities?.rollback === "non-rollbackable"
    ? "non-rollbackable"
    : "candidate-atomic";
