/**
 * Candidate preparation and resolution.
 *
 * `prepareExecutionCandidate` turns a plan into the immutable execution
 * candidate every later step refers to: it augments the plan with lockfile
 * reconciliation, projects configured-agent outcomes, scans readiness,
 * assembles the semantic risk conditions, and fingerprints the material
 * preimages. `resolveExecutionCandidate` presents that candidate, fails
 * closed on blockers and missing policies, previews or confirms, acquires
 * the workspace transition, revalidates the same candidate under it, applies
 * it closure by closure, and produces one `OperationResolution` at every
 * termination path. Presentation and prompting live behind the
 * `ResolvePlanInteraction` port; per-type outcome refinement behind the
 * `ConfiguredAgentOutcomesProvider`.
 *
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Cause from "effect/Cause";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import {
  ApprovalRecoveryMissing,
  STALE_CANDIDATE_DETAIL,
  StaleExecutionCandidate,
  StepFailure,
} from "./errors.js";
import { applyPlan } from "./apply-plan.js";
import {
  isExecutionCandidateFresh,
  makeExecutionCandidate,
  type ExecutionCandidate,
} from "./execution-candidate.js";
import { augmentPlanWithReconciliation } from "../operations/augment-plan.js";
import { scanPlanReadiness } from "../operations/scan-plan-readiness.js";
import type { CompletedJobStep, ExecutedPlan, Plan } from "./plan.js";
import {
  declaredAtomicity,
  executedUnits,
  makeOperationResolution,
  plannedUnits,
  unitIdOf,
  type OperationBlock,
  type OperationFootprintEntry,
  type OperationPhase,
  type OperationResolution,
  type ResolvedUnit,
} from "./operation-resolution.js";
import {
  OperationJournal,
  appendResolvedUnit,
  appendStartedUnit,
  recordJournalPhase,
  recordOperationJournal,
} from "./operation-journal.js";
import {
  CurrentOperationUnit,
  observeUnit,
  publishOperationEvent,
  publishPhaseStarted,
  publishWaitEnded,
  publishWaiting,
} from "./operation-events.js";
import {
  ConfiguredAgentOutcomesProvider,
  WorkspaceMutations,
  configuredAgentLifecycleOutcomes,
  type ConfiguredAgentOutcome,
  type ConfiguredAgentOutcomesProviderService,
  type WorkspaceMutationsService,
} from "@agentxm/workspace-state";
import {
  FootprintRecorder,
  WorkspaceRestorationIncomplete,
  acquireWorkspaceTransition,
  pendingClosureRestorations,
  readFootprint,
  rollbackWorkspaceClosure,
  runWorkspaceTransaction,
  settleWorkspaceClosure,
  withWorkspaceClosure,
} from "@agentxm/workspace-transactions";
import { InterruptionSignalSource } from "./interruption-signal.js";
import { ResolvePlanInteraction } from "./resolve-plan-interaction.js";
import {
  confirmationRecoverySuggestions,
  namedPolicyRecoverySuggestions,
  type ConfiguredAgentOperation,
  type PlanExecution,
} from "./plan-execution.js";
import {
  candidateFingerprintFailedToStepFailure,
  configuredAgentOutcomesUnavailableToStepFailure,
  restorationIncompleteToStepFailure,
  workspaceStateReadFailureToStepFailure,
  workspaceTransactionFailureToStepFailure,
} from "./step-failure-conversions.js";

/** Publish a phase transition to the lifecycle stream and the journal. */
const enterPhase = (phase: OperationPhase): Effect.Effect<void, never, OperationJournal> =>
  publishPhaseStarted(phase).pipe(Effect.andThen(recordJournalPhase(phase)));

interface PlanApplyFailure<Output> {
  readonly error: StepFailure | StaleExecutionCandidate;
  readonly attemptedExecution?: ExecutedPlan<Output>;
  /** The typed restoration-failure fact; present only when rollback did not complete. */
  readonly restoration?: WorkspaceRestorationIncomplete;
}

const withPlannedAgentOutcomes = <Requirements, Output>(
  plan: Plan<Requirements, Output>,
  outcomes: ReadonlyArray<ConfiguredAgentOutcome>,
): Plan<Requirements, Output> => ({
  ...plan,
  jobs: plan.jobs.map((job) => ({
    ...job,
    steps: job.steps.map((step) => ({
      ...step,
      agentOutcomes:
        step.agentOutcomes === undefined || step.agentOutcomes.length === 0
          ? outcomes
          : step.agentOutcomes,
      ...(step.artifact === undefined
        ? {}
        : {
            artifact: {
              ...step.artifact,
              agentOutcomes:
                step.artifact.agentOutcomes === undefined ||
                step.artifact.agentOutcomes.length === 0
                  ? outcomes
                  : step.artifact.agentOutcomes,
            },
          }),
    })),
  })),
});

const withExecutedAgentOutcomes = <Output>(
  plan: ExecutedPlan<Output>,
  outcomes: ReadonlyArray<ConfiguredAgentOutcome>,
): ExecutedPlan<Output> => ({
  ...plan,
  jobs: plan.jobs.map((job) => ({
    ...job,
    steps: job.steps.map((step) => ({
      ...step,
      agentOutcomes: outcomes,
      ...(step.result.result === "success" && step.result.artifact !== undefined
        ? {
            result: {
              ...step.result,
              artifact: {
                ...step.result.artifact,
                agentOutcomes:
                  step.result.artifact.agentOutcomes === undefined ||
                  step.result.artifact.agentOutcomes.length === 0
                    ? outcomes
                    : step.result.artifact.agentOutcomes,
              },
            },
          }
        : {}),
    })),
  })),
});

/**
 * The generic lifecycle outcomes for one operation, refined by the provider's
 * per-type override when the operation enables the extension.
 */
const outcomesFor = (
  ws: WorkspaceMutationsService,
  provider: ConfiguredAgentOutcomesProviderService,
  configuredAgents: ReadonlyArray<string>,
  operation: ConfiguredAgentOperation,
  state: "projected" | "current",
): Effect.Effect<ReadonlyArray<ConfiguredAgentOutcome>> => {
  const generic = configuredAgentLifecycleOutcomes({
    type: operation.extensionType,
    name: operation.name,
    agentIds: configuredAgents,
    scope: ws.scope,
    state,
    targetState: operation.plannedState,
    installed: state === "projected",
    observedAgentIds: state === "projected" ? configuredAgents : [],
  });
  const override = provider.byExtensionType[operation.extensionType];
  if (operation.plannedState === "enabled" && override !== undefined) {
    return override(state).pipe(
      Effect.map((outcomes) => outcomes.filter(({ name }) => name === operation.name)),
      Effect.map((outcomes) => (outcomes.length === 0 ? generic : outcomes)),
      Effect.catch(() => Effect.succeed(generic)),
    );
  }
  return Effect.succeed(generic);
};

/** The readiness blockers a plan's error steps contribute beyond declared conditions. */
const readinessBlockersOf = <Requirements, Output>(plan: Plan<Requirements, Output>) => {
  const declaredConditionIds = new Set(
    (plan.riskConditions ?? []).map((condition) => condition.id),
  );
  return plan.jobs.flatMap((job) =>
    job.steps.flatMap((step) =>
      step.readiness === "error"
        ? (step.blockingConditionIds ?? []).length > 0 &&
          (step.blockingConditionIds ?? []).every((id) => declaredConditionIds.has(id))
          ? []
          : [
              {
                level: "blocked" as const,
                id: step.key ?? step.label,
                detail: step.errorMessage,
                errorCode: "conflict" as const,
              },
            ]
        : [],
    ),
  );
};

export interface PrepareExecutionCandidateOptions {
  /** Operations whose configured-agent outcomes the candidate projects and, after apply, verifies. */
  readonly configuredAgentOperations?: ReadonlyArray<ConfiguredAgentOperation>;
}

/**
 * Prepare the immutable execution candidate for a plan: augment with lockfile
 * reconciliation, project configured-agent outcomes, scan readiness, assemble
 * risk conditions, and fingerprint every material preimage. Preview,
 * confirmation, and apply all refer to the candidate this returns.
 */
export const prepareExecutionCandidate = Effect.fn("prepareExecutionCandidate")(function* <
  Requirements,
  Output,
>(plan: Plan<Requirements, Output>, options?: PrepareExecutionCandidateOptions) {
  const ws = yield* WorkspaceMutations;
  const provider = yield* ConfiguredAgentOutcomesProvider;

  yield* publishPhaseStarted("planning");

  // Lockfile reconciliation, observed as one planning unit.
  const augmented = yield* observeUnit(
    { id: "lockfile-reconciliation", label: "lockfile reconciliation" },
    augmentPlanWithReconciliation(plan, () => ws.getLockfileState()),
  );

  const operations = options?.configuredAgentOperations ?? [];
  const configuredAgents = operations.length === 0 ? [] : yield* ws.getConfiguredAgents();
  const projectedOutcomes = (yield* Effect.forEach(operations, (operation) =>
    outcomesFor(ws, provider, configuredAgents, operation, "projected"),
  )).flat();
  const augmentedPlan =
    operations.length === 0
      ? augmented.plan
      : withPlannedAgentOutcomes(augmented.plan, projectedOutcomes);

  // Readiness blockers and unmet preconditions join the declared risk
  // conditions, so the candidate carries every reason it could be refused.
  const preconditionBlockers = (augmentedPlan.preconditions ?? []).flatMap((precondition) =>
    precondition.status === "unmet"
      ? [
          {
            level: "blocked" as const,
            id: precondition.id,
            detail: precondition.detail ?? precondition.label,
            errorCode:
              precondition.blockedOn === "human"
                ? ("auth_required" as const)
                : ("conflict" as const),
          },
        ]
      : [],
  );
  const riskConditions = [
    ...(augmentedPlan.riskConditions ?? []),
    ...readinessBlockersOf(augmentedPlan),
    ...preconditionBlockers,
  ];
  const candidatePlan: Plan<Requirements, Output> = {
    ...augmentedPlan,
    ...(riskConditions.length === 0 ? {} : { riskConditions }),
  };
  return yield* makeExecutionCandidate(
    candidatePlan,
    {
      settingsPath: ws.layout.settingsPath,
      lockPath: ws.layout.lockPath,
      baseDir: ws.baseDir,
    },
    operations,
  );
});

export interface ResolveExecutionCandidateOptions<Requirements, Output> {
  /** A typed pre-apply gate that runs under the transition before revalidation. */
  readonly beforeApply?: (
    candidate: ExecutionCandidate<Requirements, Output>,
  ) => Effect.Effect<void, StepFailure, Requirements>;
}

/**
 * Preview or apply a prepared candidate.
 *
 * 1. Present the immutable candidate.
 * 2. Fail closed on blockers and missing named policies.
 * 3. Preview, or approve confirmable semantic risk.
 * 4. Acquire the workspace transition, revalidate the same candidate under
 *    it, and apply it closure by closure.
 *
 * Every termination path resolves to one `OperationResolution`.
 */
export const resolveExecutionCandidate = Effect.fn("resolveExecutionCandidate")(function* <
  Requirements,
  Output,
>(
  candidate: ExecutionCandidate<Requirements, Output>,
  execution: PlanExecution,
  options?: ResolveExecutionCandidateOptions<Requirements, Output>,
) {
  const ws = yield* WorkspaceMutations;
  const provider = yield* ConfiguredAgentOutcomesProvider;
  const interaction = yield* ResolvePlanInteraction;
  const path = yield* Path.Path;
  // The journal and footprint recorder are requirements of the operation
  // boundary: the settlement observers below record into them.
  const journal = yield* OperationJournal;
  yield* FootprintRecorder;

  const mode = execution.request.mode;
  const candidatePlan = candidate.plan;
  const operations = candidate.configuredAgentOperations;
  const configuredAgents = operations.length === 0 ? [] : yield* ws.getConfiguredAgents();
  const readiness = scanPlanReadiness(candidatePlan);
  const readinessBlockers = readinessBlockersOf(candidatePlan);
  const riskConditions = candidatePlan.riskConditions ?? [];

  const atomicity = declaredAtomicity(candidatePlan);
  const resolutionBase = {
    name: candidatePlan.name,
    description: candidatePlan.description,
    mode,
    candidateId: candidate.id,
    releaseAge: candidatePlan.releaseAge,
    preconditions: candidatePlan.preconditions,
    riskConditions: riskConditions.length === 0 ? undefined : riskConditions,
    presentation: candidatePlan.presentation,
  };

  yield* recordOperationJournal({
    name: candidatePlan.name,
    description: candidatePlan.description,
    mode,
    candidateId: candidate.id,
    atomicity: { declared: atomicity, applied: atomicity },
    ...(candidatePlan.presentation === undefined
      ? {}
      : { presentation: candidatePlan.presentation }),
    ...(candidatePlan.releaseAge === undefined ? {} : { releaseAge: candidatePlan.releaseAge }),
    ...(candidatePlan.preconditions === undefined
      ? {}
      : { preconditions: candidatePlan.preconditions }),
    ...(riskConditions.length === 0 ? {} : { riskConditions }),
    plannedUnits: plannedUnits(candidatePlan.jobs),
    phase: "planning",
    startedUnitIds: [],
    resolved: [],
    restoresOnFailure: candidatePlan.executionCapabilities?.rollback !== "non-rollbackable",
  });

  const notExecuted = (over: {
    readonly blocking?: OperationBlock;
    readonly declined?: boolean;
    readonly failure?: StepFailure;
    readonly units?: ReadonlyArray<ResolvedUnit<Output>>;
  }): OperationResolution<Output> =>
    makeOperationResolution<Output>({
      ...resolutionBase,
      atomicity: { declared: atomicity, applied: "closure-atomic" },
      units: over.units ?? plannedUnits(candidatePlan.jobs),
      blocking: over.blocking,
      declined: over.declined,
      failure: over.failure,
      suggestions: candidatePlan.failureSuggestions,
    });

  // Display the immutable candidate before any policy terminal or effect.
  if (mode === "preview") {
    yield* enterPhase("preview");
  }
  const hasConfirmableRisk = riskConditions.some((condition) => condition.level === "confirmable");
  yield* interaction.presentPlan(candidatePlan, { mode });

  // Hard blockers dominate preview, overrides, and confirmation.
  if (readiness.hasErrors) {
    const firstError = readinessBlockers[0];
    return notExecuted({
      blocking: {
        class: "precondition-unmet",
        subject: firstError?.id ?? candidatePlan.name,
        phase: "planning",
        detail: firstError?.detail ?? readiness.errorMessages[0] ?? "The plan cannot proceed.",
        causeCode: firstError?.errorCode ?? "conflict",
      },
    });
  }
  const blocked = riskConditions.find((condition) => condition.level === "blocked");
  if (blocked !== undefined) {
    return notExecuted({
      blocking: {
        class: "precondition-unmet",
        subject: blocked.id,
        phase: "planning",
        detail: blocked.detail,
        causeCode: blocked.errorCode,
        reference: blocked.id,
      },
    });
  }

  // Preview is speculative and never grants approval to a later invocation.
  if (execution.request.mode === "preview") {
    return makeOperationResolution<Output>({
      ...resolutionBase,
      atomicity: { declared: atomicity, applied: "closure-atomic" },
      units: plannedUnits(candidatePlan.jobs),
    });
  }

  if (!("approvalRecovery" in execution)) {
    return yield* new ApprovalRecoveryMissing();
  }
  const applyExecution = execution;

  const overrideConditions = riskConditions.filter(
    (
      condition,
    ): condition is Extract<
      (typeof riskConditions)[number],
      { readonly level: "override-required" }
    > => condition.level === "override-required",
  );
  const missingOverrides = overrideConditions.filter(
    (condition) => !applyExecution.request.acceptedPolicies.has(condition.policy),
  );
  if (missingOverrides.length > 0) {
    const first = missingOverrides[0];
    const escapes = namedPolicyRecoverySuggestions(
      applyExecution.approvalRecovery,
      missingOverrides.map((condition) => condition.requiredFlag),
    );
    return makeOperationResolution<Output>({
      ...resolutionBase,
      atomicity: { declared: atomicity, applied: "closure-atomic" },
      units: plannedUnits(candidatePlan.jobs),
      blocking: {
        class: "override-required",
        subject: first?.id ?? candidatePlan.name,
        phase: "confirmation",
        detail: first?.detail ?? "A named policy override is required.",
        ...(escapes[0] === undefined ? {} : { escape: escapes[0] }),
      },
      suggestions: escapes,
    });
  }

  // Confirmation. A condition that consents only at a prompt — a publisher
  // change, or any confirmable condition met by a command with no
  // preapprovable confirmation — is never satisfied by preapproval. A
  // preapprovable condition is satisfied by explicit preapproval; otherwise
  // it is asked when a prompt can open and blocks when one cannot, naming
  // the recovery its route actually supports.
  const hasSteps = candidatePlan.jobs.some((job) => job.steps.length > 0);
  if (hasSteps && hasConfirmableRisk) {
    const approval = applyExecution.request.confirmableRiskApproval;
    const interactiveOnly = riskConditions.find(
      (condition) => condition.level === "confirmable" && condition.consent === "interactive-only",
    );
    const requiresPrompt = interactiveOnly !== undefined || approval === "interactive-only";
    if (requiresPrompt || approval === "prompt-if-interactive") {
      if (!(yield* interaction.isConfirmationAvailable)) {
        const confirmable =
          interactiveOnly ?? riskConditions.find((condition) => condition.level === "confirmable");
        const escapes = confirmationRecoverySuggestions(
          applyExecution.approvalRecovery,
          requiresPrompt ? "interactive" : "preapprovable",
        );
        return makeOperationResolution<Output>({
          ...resolutionBase,
          atomicity: { declared: atomicity, applied: "closure-atomic" },
          units: plannedUnits(candidatePlan.jobs),
          blocking: {
            class: "approval-required",
            subject: confirmable?.id ?? candidatePlan.name,
            phase: "confirmation",
            detail: requiresPrompt
              ? `${confirmable?.detail ?? "This plan requires confirmation before it can apply."} Interactive approval is required; preapproval does not apply.`
              : (confirmable?.detail ?? "This plan requires confirmation before it can apply."),
            ...(escapes[0] === undefined ? {} : { escape: escapes[0] }),
          },
          suggestions: escapes,
        });
      }
      yield* enterPhase("confirmation");
      const confirmation = yield* interaction.confirmApplyChanges(applyExecution.approvalRecovery);
      if (confirmation !== "approved") {
        return notExecuted({ declined: true });
      }
    }
  }

  // Acquire the workspace transition — planning, network acquisition,
  // preview, and confirmation ran without it — then revalidate every material
  // candidate preimage and apply the exact candidate while holding it.
  const totalUnits = candidate.plan.jobs.reduce((count, job) => count + job.steps.length, 0);
  const resolvedUnitState = (step: CompletedJobStep<Output>) =>
    executedUnits<Output>(
      {
        _tag: "ExecutedPlan",
        name: candidatePlan.name,
        description: candidatePlan.description,
        jobs: [{ concurrency: 1, steps: [step] }],
      },
      { restored: false },
    )[0]?.state ?? "committed";
  const startedUnits = yield* Ref.make(0);
  const resolvedUnits = yield* Ref.make(0);
  const applyFreshCandidate = Effect.gen(function* () {
    yield* enterPhase("validation");
    if (!(yield* isExecutionCandidateFresh(candidate))) {
      return yield* new StaleExecutionCandidate({ candidate: candidatePlan.name });
    }
    if (options?.beforeApply !== undefined) {
      yield* options.beforeApply(candidate);
      if (!(yield* isExecutionCandidateFresh(candidate))) {
        return yield* new StaleExecutionCandidate({ candidate: candidatePlan.name });
      }
    }
    yield* enterPhase("apply");
    // Each unit is one semantic closure: its run executes under its closure
    // identity so the transaction attributes every snapshot to it, and its
    // settlement (below) either commits or rolls back exactly that closure.
    const closureScopedPlan: Plan<Requirements, Output> = {
      ...candidate.plan,
      jobs: candidate.plan.jobs.map((job) => ({
        ...job,
        steps: job.steps.map((step) =>
          step.readiness === "error"
            ? step
            : {
                ...step,
                run: withWorkspaceClosure(unitIdOf(step))(step.run).pipe(
                  Effect.provideService(CurrentOperationUnit, { unitId: unitIdOf(step) }),
                ),
              },
        ),
      })),
    };
    return yield* applyPlan(closureScopedPlan, {
      // The started fact is journaled before the run's first effect, so an
      // interruption mid-run reports the unit in flight, never not attempted.
      onStepStarted: (step) =>
        appendStartedUnit(unitIdOf(step)).pipe(
          Effect.provideService(OperationJournal, journal),
          Effect.andThen(Ref.getAndUpdate(startedUnits, (index) => index + 1)),
          Effect.flatMap((index) =>
            publishOperationEvent((seq, atMs) => ({
              _tag: "UnitStarted",
              seq,
              atMs,
              unitId: unitIdOf(step),
              label: step.label,
              index,
              total: totalUnits,
            })),
          ),
        ),
      // Settlement runs before the next interruptible boundary: the journal
      // fact and the closure's snapshot disposition are recorded together —
      // a settled closure's commits stand, a failed closure restores only
      // itself, and later ready closures continue.
      onStepCompleted: (step) =>
        appendResolvedUnit(step).pipe(
          Effect.provideService(OperationJournal, journal),
          Effect.andThen(
            step.result.result === "error"
              ? rollbackWorkspaceClosure(unitIdOf(step))
              : settleWorkspaceClosure(unitIdOf(step)),
          ),
          Effect.andThen(Ref.getAndUpdate(resolvedUnits, (index) => index + 1)),
          Effect.flatMap((index) =>
            publishOperationEvent((seq, atMs) => ({
              _tag: "UnitResolved",
              seq,
              atMs,
              unitId: unitIdOf(step),
              label: step.label,
              state: resolvedUnitState(step),
              index,
              total: totalUnits,
            })),
          ),
        ),
    });
  });
  const applyCandidate = Effect.gen(function* () {
    const result = yield* applyFreshCandidate.pipe(
      Effect.mapError(
        (error) =>
          ({
            error:
              error._tag === "CandidateFingerprintFailed"
                ? candidateFingerprintFailedToStepFailure(error)
                : error,
          }) satisfies PlanApplyFailure<Output>,
      ),
    );
    const failedStep = result.jobs
      .flatMap((job) => job.steps)
      .find((step) => step.result.result === "error");
    // Closures settle independently: a failed closure rolled back only
    // itself at its settlement boundary, and settled commits stand. The one
    // apply-level failure is a closure rollback that did not complete and
    // verify — the typed restoration fact derives the retained truth from
    // the in-memory pending record alone.
    const pendingRestoration = yield* pendingClosureRestorations;
    if (Option.isSome(pendingRestoration) && pendingRestoration.value.failures.length > 0) {
      const pending = pendingRestoration.value;
      const first = pending.failures[0];
      const stepError =
        failedStep !== undefined && failedStep.result.result === "error"
          ? failedStep.result.error
          : new StepFailure({
              category: "internal",
              detail: "a closure rollback did not complete",
            });
      return yield* Effect.fail({
        error: new StepFailure({
          category: stepError.category,
          detail:
            failedStep?.result.result === "error" ? failedStep.result.message : stepError.detail,
          cause: stepError,
        }),
        attemptedExecution: result,
        restoration: new WorkspaceRestorationIncomplete({
          terminationCause: "failure",
          transitionCause: Cause.fail(stepError),
          restorationCause: first?.restorationCause,
          snapshotDir: pending.snapshotDir,
          retained: pending.failures.flatMap((failure) => failure.retained),
          closureIds: pending.failures.map((failure) => failure.closureId),
        }),
      } satisfies PlanApplyFailure<Output>);
    }
    if (operations.length === 0) {
      return { ...result, candidateId: candidate.id } satisfies ExecutedPlan<Output>;
    }
    const currentOutcomes = (yield* Effect.forEach(operations, (operation) => {
      const override = provider.byExtensionType[operation.extensionType];
      return operation.plannedState === "enabled" && override !== undefined
        ? override("current").pipe(
            Effect.map((outcomes) => outcomes.filter(({ name }) => name === operation.name)),
            Effect.mapError(configuredAgentOutcomesUnavailableToStepFailure),
          )
        : operation.plannedState === "enabled"
          ? ws.records.getExtensionInventory(operation.extensionType, {}).pipe(
              Effect.mapError(workspaceStateReadFailureToStepFailure),
              Effect.map(
                (inventory) =>
                  inventory.items.find((item) => item.name === operation.name)?.agentOutcomes ??
                  configuredAgentLifecycleOutcomes({
                    type: operation.extensionType,
                    name: operation.name,
                    agentIds: configuredAgents,
                    scope: ws.scope,
                    state: "current",
                    targetState: "enabled",
                    installed: false,
                  }),
              ),
            )
          : Effect.succeed(
              configuredAgentLifecycleOutcomes({
                type: operation.extensionType,
                name: operation.name,
                agentIds: configuredAgents,
                scope: ws.scope,
                state: "current",
                targetState: operation.plannedState,
                installed: false,
              }),
            );
    })).flat();
    const incomplete = currentOutcomes.find(
      ({ outcome }) => outcome === "blocked" || outcome === "failed",
    );
    const executedWithOutcomes = withExecutedAgentOutcomes(result, currentOutcomes);
    if (incomplete !== undefined) {
      return yield* Effect.fail({
        error: new StepFailure({
          category: "conflict",
          detail: `${incomplete.extensionType} ${incomplete.name} did not converge for ${incomplete.agentId}: ${incomplete.reason}`,
        }),
        attemptedExecution: executedWithOutcomes,
      });
    }
    return {
      ...executedWithOutcomes,
      candidateId: candidate.id,
    } satisfies ExecutedPlan<Output>;
  });
  const isPlanApplyFailureShape = (value: unknown): value is PlanApplyFailure<Output> =>
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "object" &&
    value.error !== null &&
    "_tag" in value.error &&
    (value.error._tag === "StepFailure" || value.error._tag === "StaleExecutionCandidate");
  const guardedApply = (
    candidatePlan.executionCapabilities?.rollback === "non-rollbackable"
      ? applyCandidate
      : runWorkspaceTransaction({
          targets: [],
          transition: applyCandidate,
          validate: () => Effect.void,
          onRestorationStarted: enterPhase("restoration").pipe(
            Effect.provideService(OperationJournal, journal),
          ),
          // Closures protect the shared settings and lockfile at their own
          // first touch; claiming them here would let a late failure tear an
          // earlier closure's settled commit out of the shared files.
          claimDefaultTargets: false,
        })
  ).pipe(
    Effect.mapError((failure): PlanApplyFailure<Output> => {
      if (failure instanceof WorkspaceRestorationIncomplete) {
        // The transition's own failure travels inside the typed value; the
        // resolution derives units and failure from it, and the recovery
        // requirement from the restoration fact — never from disk.
        const transitionFailure = Cause.findErrorOption(failure.transitionCause);
        const inner = Option.getOrUndefined(transitionFailure);
        const innerApplyFailure = isPlanApplyFailureShape(inner) ? inner : undefined;
        return {
          error: innerApplyFailure?.error ?? restorationIncompleteToStepFailure(failure),
          ...(innerApplyFailure?.attemptedExecution === undefined
            ? {}
            : { attemptedExecution: innerApplyFailure.attemptedExecution }),
          restoration: failure,
        };
      }
      return "error" in failure
        ? failure
        : { error: workspaceTransactionFailureToStepFailure(failure) };
    }),
  );
  const transitionSubject = "workspace-transition";
  const applyResult = yield* Effect.scoped(
    Effect.gen(function* () {
      const waited = yield* Ref.make(false);
      const contention = yield* acquireWorkspaceTransition({
        command: applyExecution.approvalRecovery.command.join(" "),
        candidateId: candidate.id,
        // Contention is a first-class lifecycle fact: observers render the
        // wait and its holder; nothing here decides how it is worded.
        onWaiting: (holder) =>
          Ref.set(waited, true).pipe(
            Effect.andThen(
              publishWaiting({
                blockingClass: "resource-conflict",
                subject: transitionSubject,
                detail: Option.match(holder, {
                  onNone: () => "another operation",
                  onSome: (value) => `${value.command} (pid ${String(value.pid)})`,
                }),
              }),
            ),
          ),
      });
      if (yield* Ref.get(waited)) yield* publishWaitEnded(transitionSubject);
      if (Option.isSome(contention)) {
        return { type: "contention", contention: contention.value } as const;
      }
      return yield* guardedApply.pipe(
        Effect.match({
          onFailure: (error) => ({ type: "failure", error }) as const,
          onSuccess: (value) => ({ type: "success", value }) as const,
        }),
      );
    }),
  );
  if (applyResult.type === "contention") {
    const reference = Option.match(applyResult.contention.holder, {
      onNone: () => undefined,
      onSome: (holder) => `${holder.command} (pid ${holder.pid})`,
    });
    const escape = { description: "Wait for the holding operation to finish, then rerun." };
    return makeOperationResolution<Output>({
      ...resolutionBase,
      atomicity: { declared: atomicity, applied: "closure-atomic" },
      units: plannedUnits(candidatePlan.jobs),
      blocking: {
        class: "resource-conflict",
        subject: candidatePlan.name,
        phase: "validation",
        detail: `another operation holds the workspace transition${
          reference === undefined ? "" : ` (${reference})`
        }; waited ${Math.round(applyResult.contention.waitedMillis / 1000)}s`,
        causeCode: "conflict",
        ...(reference === undefined ? {} : { reference }),
        escape,
      },
      suggestions: [escape],
    });
  }
  const observedFootprint: ReadonlyArray<OperationFootprintEntry> = (yield* readFootprint)
    .map((entry) => ({
      path: path.isAbsolute(entry.path) ? path.relative(ws.baseDir, entry.path) : entry.path,
      change: entry.change,
    }))
    // The footprint reports durable workspace changes; scratch outside the
    // workspace base (scoped temp staging) is removed with the invocation.
    .filter((entry) => !entry.path.startsWith(".."));
  const footprint =
    observedFootprint.length === 0
      ? undefined
      : observedFootprint
          .filter(
            (entry, index) =>
              observedFootprint.findIndex(
                (other) => other.path === entry.path && other.change === entry.change,
              ) === index,
          )
          // Identity order (code-unit), so twin runs report identical bytes
          // regardless of concurrent write scheduling.
          .sort((left, right) =>
            left.path < right.path
              ? -1
              : left.path > right.path
                ? 1
                : left.change < right.change
                  ? -1
                  : left.change > right.change
                    ? 1
                    : 0,
          );

  if (applyResult.type === "failure") {
    const failure = applyResult.error.error;
    const attempted = applyResult.error.attemptedExecution;
    // Restoration failure is a typed fact on the transaction's error channel;
    // the resolution derives the retained set, disposition, and exit from
    // that value alone — never from re-reading disk. Nothing persists in the
    // workspace: the next mutation plans from the current workspace state.
    const restoration = applyResult.error.restoration;
    const interruptionSignal =
      restoration?.terminationCause === "interruption"
        ? Option.match(yield* Effect.serviceOption(InterruptionSignalSource), {
            onNone: () => "SIGINT" as const,
            onSome: (source) => source.requestedSignal() ?? "SIGINT",
          })
        : undefined;
    const rollbackFailed = restoration !== undefined;
    const restorationRecovery =
      restoration === undefined
        ? undefined
        : {
            retained: [...restoration.retained],
            ...(restoration.snapshotDir === undefined
              ? {}
              : { snapshotDir: restoration.snapshotDir }),
            actions: [
              {
                description:
                  "Re-run the command; the next mutation plans from the current workspace state.",
              },
            ],
          };
    const restoring = candidatePlan.executionCapabilities?.rollback !== "non-rollbackable";
    const executed =
      attempted === undefined
        ? plannedUnits<Requirements, Output>(candidatePlan.jobs)
        : executedUnits(attempted);
    // Closures settled independently: commits stand, and each failed closure
    // restored only itself. A closure named by the restoration fact kept the
    // state its rollback could not undo; every other failed closure's
    // effects were restored.
    const retainedClosures = new Set(restoration?.closureIds ?? []);
    const units = executed.map((unit) => {
      if (unit.state === "failed" && restoring) {
        return {
          ...unit,
          disposition: retainedClosures.has(unit.id)
            ? ("retained" as const)
            : ("restored" as const),
        };
      }
      if (unit.state === "committed" && rollbackFailed && restoration?.closureIds === undefined) {
        // An operation-level restoration failure (not scoped to closures):
        // committed effects were retained as the failure left them.
        return { ...unit, disposition: "retained" as const };
      }
      return unit;
    });
    const staleUnit = units.find((unit) => unit.blocking?.class === "stale-candidate");
    if (failure._tag === "StaleExecutionCandidate" || staleUnit !== undefined) {
      return makeOperationResolution<Output>({
        ...resolutionBase,
        atomicity: { declared: atomicity, applied: "closure-atomic" },
        units,
        blocking: {
          class: "stale-candidate",
          subject: staleUnit?.id ?? candidatePlan.name,
          phase: "validation",
          detail: staleUnit?.blocking?.detail ?? STALE_CANDIDATE_DETAIL,
          escape: { description: "Rerun the command to resolve a fresh candidate." },
        },
        suggestions: [{ description: "Rerun the command to resolve a fresh candidate." }],
      });
    }
    return makeOperationResolution<Output>({
      ...resolutionBase,
      atomicity: {
        declared: atomicity,
        applied: rollbackFailed ? "non-rollbackable" : atomicity,
      },
      units,
      failure,
      footprint,
      ...(restorationRecovery === undefined ? {} : { recovery: restorationRecovery }),
      ...(interruptionSignal === undefined
        ? {}
        : {
            interruption: {
              signal: interruptionSignal,
              disposition: "retained",
            },
          }),
      suggestions: failure.suggestions ?? candidatePlan.failureSuggestions,
    });
  }
  const executed = applyResult.value;
  const restoringPlan = candidatePlan.executionCapabilities?.rollback !== "non-rollbackable";
  // Mixed commits and failures are a first-class partial outcome: settled
  // closures stand, and each failed closure of a restoring plan rolled back
  // only itself — its disposition says so.
  const executedResolved = executedUnits(executed).map((unit) =>
    unit.state === "failed" && restoringPlan ? { ...unit, disposition: "restored" as const } : unit,
  );
  // A restoring plan's first failed closure supplies the operation-level
  // failure so the cause class keeps deciding the exit and the human summary
  // names the failure. Non-rollbackable families (remote mutations such as
  // publish) keep their long-standing behavior: unit outcomes alone carry the
  // failures, and an operation-level failure still means the plan itself
  // could not execute.
  const firstFailed = restoringPlan
    ? executedResolved.find((unit) => unit.state === "failed")
    : undefined;
  const failure =
    firstFailed?.error === undefined
      ? undefined
      : new StepFailure({
          category: firstFailed.error.category,
          detail: firstFailed.message ?? firstFailed.error.detail,
          cause: firstFailed.error,
          ...(firstFailed.error.suggestions === undefined
            ? {}
            : { suggestions: firstFailed.error.suggestions }),
        });
  return makeOperationResolution<Output>({
    ...resolutionBase,
    atomicity: { declared: atomicity, applied: atomicity },
    units: executedResolved,
    ...(failure === undefined ? {} : { failure }),
    footprint,
    ...(firstFailed === undefined
      ? {}
      : {
          suggestions: firstFailed.error?.suggestions ?? candidatePlan.failureSuggestions,
        }),
  });
});
