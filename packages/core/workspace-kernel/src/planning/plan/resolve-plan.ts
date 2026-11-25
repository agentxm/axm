/**
 * Candidate resolution.
 *
 * `resolveExecutionCandidate` presents a prepared candidate, fails closed on
 * blockers and missing policies, previews or acquires verified content before
 * confirmation, then acquires the workspace transition, revalidates the same
 * candidate under it, applies it closure by closure, and produces one
 * `OperationResolution` at every termination path. Presentation and
 * prompting live behind the `ResolvePlanInteraction` port.
 *
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  collectSensitiveStrings,
  redactCredentialText,
  OperationRequestBudget,
} from "@agentxm/host-primitives";
import * as Cause from "effect/Cause";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import type { TreeIntegrity } from "../../workspace-state/index.js";
import * as Result from "effect/Result";
import * as Scope from "effect/Scope";
import {
  ApprovalRecoveryMissing,
  STALE_CANDIDATE_DETAIL,
  StaleExecutionCandidate,
  StepFailure,
  makeStepFailure,
  type CompletedJobStep,
  type ExecutedPlan,
  type Plan,
  type PlannedJobStep,
  declaredAtomicity,
  executedUnits,
  makeOperationResolution,
  plannedUnits,
  unitIdOf,
  type OperationBlock,
  type OperationFootprintEntry,
  type OperationResolution,
  type ResolvedUnit,
  OperationJournal,
  appendResolvedUnit,
  appendStartedUnit,
  recordOperationJournal,
  CurrentOperationUnit,
  observeUnit,
  publishOperationEvent,
  publishWaitEnded,
  publishWaiting,
  type UnitFailure,
  InterruptionSignalSource,
  ResolvePlanInteraction,
  confirmationRecoverySuggestions,
  namedPolicyRecoverySuggestions,
  type PlanExecution,
} from "../../operations/index.js";
import { ProjectionOutputPosture, REPLACE_UNRECORDED_FLAG } from "../../projection/index.js";
import {
  acquisitionRefsForStep,
  registryExposureRefsForStep,
  validateRegistryExposure,
  withRegistryExposure,
} from "./registry-exposure.js";
import { PlanSources } from "./plan-sources.js";
import { applyPlan } from "./apply-plan.js";
import { verifyConfiguredAgentOutcomes } from "./configured-agent-outcomes.js";
import { isExecutionCandidateFresh, type ExecutionCandidate } from "./execution-candidate.js";
import { enterPhase, withPhaseSpan } from "./operation-phase.js";
import { readinessBlockersOf, type prepareExecutionCandidate } from "./prepare-candidate.js";
import { scanPlanReadiness } from "../operations/scan-plan-readiness.js";
import { isSourceResolutionFailure } from "../../sources/index.js";
import { resolutionFailureToStepFailure } from "../resolution-step-failure.js";

import {
  SettingsReader,
  WorkspaceLocation,
  withFreshWorkspaceObservationReadView,
  candidateFingerprintFailedToStepFailure,
  configErrorToStepFailure,
  restorationIncompleteToStepFailure,
  workspaceTransactionFailureToStepFailure,
} from "../../workspace-state/index.js";
import {
  FootprintRecorder,
  WorkspaceRestorationIncomplete,
  acquireWorkspaceTransition,
  pendingClosureRestorations,
  isWorkspaceFootprint,
  readFootprint,
  rollbackWorkspaceClosure,
  runWorkspaceTransaction,
  settleWorkspaceClosure,
  withWorkspaceClosure,
} from "../../settlement/index.js";
import {
  AcquiredContent,
  sourceRefContentKey,
  selectAcquisitionQueue,
  AcquiredTreeLimitExceeded,
  measureAcquiredTree,
  MAX_ACQUIRED_TREE_BYTES,
  OperationScratchBudget,
  OperationScratchLimitExceeded,
} from "../../acquisition/index.js";

interface PlanApplyFailure<Output> {
  readonly error: StepFailure | StaleExecutionCandidate;
  readonly attemptedExecution?: ExecutedPlan<Output>;
  /** The typed restoration-failure fact; present only when rollback did not complete. */
  readonly restoration?: WorkspaceRestorationIncomplete;
}

export interface ResolveExecutionCandidateOptions<Requirements, Output> {
  /** Additional observations to re-read under the transition before applying. */
  readonly additionalFreshness?: (
    candidate: ExecutionCandidate<Requirements, Output>,
  ) => Effect.Effect<boolean, never, Requirements>;
  /**
   * The resolved material paths that `additionalFreshness` re-fingerprints.
   * When present together with `additionalFreshness`, each candidate check and
   * its additional check share one fresh observation of exactly these paths.
   * Ignored without `additionalFreshness`.
   */
  readonly additionalFreshnessMaterialPaths?: ReadonlyArray<string>;
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
 * 3. Preview, or acquire selected content and approve confirmable semantic risk.
 * 4. Acquire the workspace transition, revalidate the same candidate under
 *    it, and apply it closure by closure.
 *
 * Every termination path resolves to one `OperationResolution`.
 */
const resolveExecutionCandidateInScope = Effect.fn("resolveExecutionCandidate")(function* <
  Requirements,
  Output,
>(
  candidate: ExecutionCandidate<Requirements, Output>,
  execution: PlanExecution,
  options?: ResolveExecutionCandidateOptions<Requirements, Output>,
) {
  const location = yield* WorkspaceLocation;
  const settings = yield* SettingsReader;
  const interaction = yield* ResolvePlanInteraction;
  const path = yield* Path.Path;
  // The journal and footprint recorder are requirements of the operation
  // boundary: the settlement observers below record into them.
  const journal = yield* OperationJournal;
  yield* FootprintRecorder;

  const mode = execution.request.mode;
  const candidatePlan = candidate.plan;
  const operations = candidate.configuredAgentOperations;
  const configuredAgents = operations.length === 0 ? [] : yield* settings.configuredAgents;
  const readiness = scanPlanReadiness({
    ...candidatePlan,
    jobs: candidatePlan.jobs.filter((job) => job.executionPolicy !== "best-effort"),
  });
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
  const present = interaction.presentPlan(candidatePlan, { mode });
  yield* mode === "preview" ? withPhaseSpan("preview", present) : present;

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
  const executionNeedsPrompt =
    missingOverrides.some((condition) => condition.policy === "accept-execution-changes") &&
    (yield* interaction.isConfirmationAvailable);
  const refusedOverrides = missingOverrides.filter(
    (condition) => condition.policy !== "accept-execution-changes" || !executionNeedsPrompt,
  );
  if (refusedOverrides.length > 0) {
    const first = refusedOverrides[0];
    const escapes = namedPolicyRecoverySuggestions(
      applyExecution.approvalRecovery,
      refusedOverrides.map((condition) => condition.requiredFlag),
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

  function* sourceRefs() {
    for (const job of candidatePlan.jobs) {
      for (const step of job.steps) {
        yield* acquisitionRefsForStep(step);
      }
    }
  }
  const queue = selectAcquisitionQueue(sourceRefs());
  if (queue.type === "limit") {
    return notExecuted({
      failure: new StepFailure({
        category: "quota",
        detail: `This operation requires more than ${queue.limit} distinct source acquisitions`,
      }),
    });
  }
  const uniqueSourceRefs = queue.refs;
  const sources = yield* PlanSources;
  const budget = yield* Effect.serviceOption(OperationRequestBudget);
  const scratchBudget = yield* Effect.serviceOption(OperationScratchBudget);
  const acquisitionScope = yield* Scope.Scope;
  if (uniqueSourceRefs.length > 0) yield* enterPhase("acquisition");
  const { eligibility, acquiredResults } = yield* withRegistryExposure(
    candidatePlan,
    "before-acquisition",
    (failures) =>
      Effect.gen(function* () {
        const eligibility = new Map(failures);
        const runnable = candidatePlan.jobs
          .flatMap((job) => job.steps)
          .filter((step) => step.readiness !== "error");
        if (
          runnable.length > 0 &&
          runnable.every((step) =>
            registryExposureRefsForStep(step).some((ref) =>
              eligibility.has(sourceRefContentKey(ref)),
            ),
          )
        )
          return { eligibility, acquiredResults: [] };

        const acquiredResults = yield* Effect.forEach(
          uniqueSourceRefs,
          (ref) =>
            Effect.gen(function* () {
              const key = sourceRefContentKey(ref);
              const denial = eligibility.get(key);
              if (denial !== undefined) return { ref, key, failure: denial };
              const childScope = yield* Scope.fork(acquisitionScope);
              const attempted = yield* Effect.gen(function* () {
                const reservation = Option.isSome(scratchBudget)
                  ? yield* scratchBudget.value.reserve(MAX_ACQUIRED_TREE_BYTES)
                  : undefined;
                const files = yield* observeUnit(
                  {
                    id:
                      ref.refType === "registry"
                        ? `registry-extract:${ref.owner}/${ref.type}/${ref.name}`
                        : `source-acquire:${ref.type}/${ref.name}`,
                    label: `acquiring ${ref.name}`,
                  },
                  sources.acquire(ref),
                );
                if (reservation !== undefined) {
                  const measured = yield* measureAcquiredTree(files.scratchRoot ?? files.directory);
                  yield* reservation.settle(measured.bytes);
                }
                return files;
              }).pipe(Effect.provideService(Scope.Scope, childScope), Effect.result);
              if (Result.isSuccess(attempted)) return { ref, key, files: attempted.success };

              yield* Scope.close(childScope, Exit.fail(attempted.failure));
              const cause = attempted.failure;
              // The scratch and tree budgets are this pipeline's own limits;
              // a source-resolution failure reads as the kernel renders it
              // wherever else it surfaces.
              const failure =
                cause instanceof OperationScratchLimitExceeded
                  ? new StepFailure({
                      category: "quota",
                      detail: `Source acquisition exceeds the ${cause.capacity} byte operation scratch limit`,
                      cause,
                    })
                  : cause instanceof AcquiredTreeLimitExceeded
                    ? new StepFailure({
                        category: "quota",
                        detail: `Acquired source exceeds the ${cause.limit} ${cause.resource} tree limit`,
                        cause,
                      })
                    : !isSourceResolutionFailure(cause)
                      ? new StepFailure({
                          category: "network",
                          detail: `Could not acquire ${ref.type} ${ref.name} before applying the workspace transition`,
                          cause,
                        })
                      : cause._tag === "ConfigError"
                        ? configErrorToStepFailure(cause)
                        : resolutionFailureToStepFailure(cause);
              return { ref, key, failure };
            }),
          {
            concurrency: Option.isSome(scratchBudget)
              ? Math.min(
                  Option.isSome(budget) ? budget.value.capacity : 1,
                  Math.max(1, Math.floor(scratchBudget.value.capacity / MAX_ACQUIRED_TREE_BYTES)),
                )
              : Option.isSome(budget)
                ? budget.value.capacity
                : 1,
          },
        ).pipe((effect) =>
          uniqueSourceRefs.length === 0 ? effect : withPhaseSpan("acquisition", effect),
        );
        return { eligibility, acquiredResults };
      }),
  );
  const eligibilityFailureForStep = (step: PlannedJobStep<Requirements, Output>) =>
    registryExposureRefsForStep(step)
      .map((ref) => eligibility.get(sourceRefContentKey(ref)))
      .find((failure) => failure !== undefined);
  const runnableSteps = candidatePlan.jobs
    .flatMap((job) => job.steps)
    .filter((step) => step.readiness !== "error");
  const allDenied =
    runnableSteps.length > 0 &&
    runnableSteps.every((step) => eligibilityFailureForStep(step) !== undefined);
  const firstDenial = eligibility.values().next().value;
  if (allDenied && firstDenial !== undefined) return notExecuted({ failure: firstDenial });

  const acquiredContent = {
    materializedPackages: yield* Ref.make<ReadonlyMap<string, TreeIntegrity>>(new Map()),
    requestedKeys: new Set(uniqueSourceRefs.map(sourceRefContentKey)),
    filesByKey: new Map(
      acquiredResults.flatMap((result) =>
        "files" in result ? [[result.key, result.files] as const] : [],
      ),
    ),
    failuresByKey: new Map(
      acquiredResults.flatMap((result) =>
        "failure" in result ? [[result.key, result.failure] as const] : [],
      ),
    ),
  };

  // Confirmation. A condition that consents only at a prompt — a publisher
  // change, or any confirmable condition met by a command with no
  // preapprovable confirmation — is never satisfied by preapproval. A
  // preapprovable condition is satisfied by explicit preapproval; otherwise
  // it is asked when a prompt can open and blocks when one cannot, naming
  // the recovery its route actually supports.
  const hasSteps = candidatePlan.jobs.some((job) => job.steps.length > 0);
  if (hasSteps && (hasConfirmableRisk || executionNeedsPrompt)) {
    const approval = applyExecution.request.confirmableRiskApproval;
    const interactiveOnly = riskConditions.find(
      (condition) => condition.level === "confirmable" && condition.consent === "interactive-only",
    );
    const requiresPrompt =
      executionNeedsPrompt || interactiveOnly !== undefined || approval === "interactive-only";
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
      const confirmation = yield* interaction
        .confirmApplyChanges(applyExecution.approvalRecovery)
        .pipe(Effect.withSpan("axm.wait.confirmation"), (effect) =>
          withPhaseSpan("confirmation", effect),
        );
      if (confirmation !== "approved") {
        return notExecuted({ declined: true });
      }
    }
  }

  // A prompt or acquisition may outlive the earlier check. Refresh exact access before writes.
  const currentEligibility = yield* validateRegistryExposure(candidatePlan, "after-confirmation");
  for (const [key, failure] of currentEligibility) eligibility.set(key, failure);
  const currentDenial = eligibility.values().next().value;
  if (
    runnableSteps.length > 0 &&
    runnableSteps.every((step) => eligibilityFailureForStep(step) !== undefined) &&
    currentDenial !== undefined
  )
    return notExecuted({ failure: currentDenial });

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
  /**
   * The failure a resolved unit states while the operation is still running:
   * the category and detail its producer settled with, redacted the way every
   * other reported failure text is before it leaves this process. A unit that
   * settled as planned states none.
   */
  const publishedUnitFailure = (step: CompletedJobStep<Output>): UnitFailure | undefined =>
    step.result.result === "error"
      ? {
          category: step.result.error.category,
          detail: redactCredentialText(step.result.error.detail, {
            secrets: collectSensitiveStrings(step.result.error.metadata),
          }),
        }
      : undefined;
  const startedUnits = yield* Ref.make(0);
  const resolvedUnits = yield* Ref.make(0);
  const additionalFreshness = options?.additionalFreshness;
  const sharedFreshnessPaths = options?.additionalFreshnessMaterialPaths;
  const unsharedFreshness = Effect.gen(function* () {
    if (!(yield* isExecutionCandidateFresh(candidate))) {
      return yield* new StaleExecutionCandidate({ candidate: candidatePlan.name });
    }
    if (additionalFreshness !== undefined && !(yield* additionalFreshness(candidate))) {
      return yield* new StaleExecutionCandidate({ candidate: candidatePlan.name });
    }
  });
  // The candidate check and the additional check observe their overlapping
  // documents once, inside one fresh observation that ends before any gate or
  // write; every other candidate material is read through the port the check
  // uses without sharing.
  const candidateFreshness =
    additionalFreshness === undefined || sharedFreshnessPaths === undefined
      ? unsharedFreshness
      : Effect.gen(function* () {
          const unshared = yield* FileSystem.FileSystem;
          const sharedFreshness = Effect.gen(function* () {
            const sharedPaths = new Set(sharedFreshnessPaths);
            if (!(yield* isExecutionCandidateFresh(candidate, { sharedPaths, unshared }))) {
              return yield* new StaleExecutionCandidate({ candidate: candidatePlan.name });
            }
            if (!(yield* additionalFreshness(candidate))) {
              return yield* new StaleExecutionCandidate({ candidate: candidatePlan.name });
            }
          });
          // Only capturing the observation can fail here; without one, the
          // checks run unshared exactly as they would without the paths.
          const shared = yield* withFreshWorkspaceObservationReadView(
            Effect.result(sharedFreshness),
          ).pipe(Effect.option);
          return Option.isSome(shared)
            ? yield* Effect.fromResult(shared.value)
            : yield* unsharedFreshness;
        });
  const applyFreshCandidate = Effect.gen(function* () {
    yield* withPhaseSpan(
      "validation",
      Effect.gen(function* () {
        yield* enterPhase("validation");
        yield* candidateFreshness;
        if (options?.beforeApply !== undefined) {
          yield* options.beforeApply(candidate);
          yield* candidateFreshness;
        }
      }),
    );
    return yield* withPhaseSpan(
      "apply",
      Effect.gen(function* () {
        yield* enterPhase("apply");
        const acquired = yield* Effect.serviceOption(AcquiredContent);
        // Each unit is one semantic closure: its run executes under its closure
        // identity so the transaction attributes every snapshot to it, and its
        // settlement (below) either commits or rolls back exactly that closure.
        const closureScopedPlan: Plan<Requirements, Output> = {
          ...candidate.plan,
          jobs: candidate.plan.jobs.map((job) => ({
            ...job,
            steps: job.steps.map((step) => {
              if (step.readiness === "error") return step;
              const acquisitionFailure = Option.isSome(acquired)
                ? acquisitionRefsForStep(step)
                    .map((ref) => acquired.value.failuresByKey.get(sourceRefContentKey(ref)))
                    .find((failure) => failure !== undefined)
                : undefined;
              const admissionFailure = eligibilityFailureForStep(step) ?? acquisitionFailure;
              return {
                ...step,
                run: withWorkspaceClosure(unitIdOf(step))(
                  admissionFailure === undefined ? step.run : Effect.fail(admissionFailure),
                ).pipe(Effect.provideService(CurrentOperationUnit, { unitId: unitIdOf(step) })),
              };
            }),
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
                  ...(publishedUnitFailure(step) === undefined
                    ? {}
                    : { failure: publishedUnitFailure(step) }),
                })),
              ),
            ),
        });
      }),
    );
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
          recovery: pending.failures.flatMap((failure) => failure.recovery),
          retained: pending.failures.flatMap((failure) => failure.retained),
          closureIds: pending.failures.map((failure) => failure.closureId),
        }),
      } satisfies PlanApplyFailure<Output>);
    }
    if (operations.length === 0) {
      return { ...result, candidateId: candidate.id } satisfies ExecutedPlan<Output>;
    }
    return yield* verifyConfiguredAgentOutcomes(
      result,
      failedStep,
      operations,
      configuredAgents,
      location.scope,
      candidate.id,
    );
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
  const requiresRegistryAccess = candidatePlan.jobs.some((job) =>
    job.steps.some((step) => registryExposureRefsForStep(step).length > 0),
  );
  const applyResult = yield* Effect.gen(function* () {
    // Repeated contenders cannot keep an invocation retrying indefinitely.
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = yield* Effect.scoped(
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
          const didWait = yield* Ref.get(waited);
          if (didWait) yield* publishWaitEnded(transitionSubject);
          if (Option.isSome(contention)) {
            return { type: "contention", contention: contention.value } as const;
          }
          // Release this attempt's lock before obtaining any new remote decision.
          if (didWait && requiresRegistryAccess) return { type: "retry-access" } as const;
          return yield* guardedApply.pipe(
            Effect.provideService(AcquiredContent, acquiredContent),
            Effect.match({
              onFailure: (error) => ({ type: "failure", error }) as const,
              onSuccess: (value) => ({ type: "success", value }) as const,
            }),
          );
        }),
      );
      if (result.type !== "retry-access") return result;
      if (attempt < 2) {
        const refreshed = yield* validateRegistryExposure(candidatePlan, "after-contention");
        for (const [key, failure] of refreshed) eligibility.set(key, failure);
      }
    }
    return {
      type: "failure",
      error: {
        error: new StepFailure({
          category: "conflict",
          detail:
            "Workspace contention repeatedly invalidated current access; rerun the operation.",
        }),
      } satisfies PlanApplyFailure<Output>,
    } as const;
  });
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
    .filter(isWorkspaceFootprint(path, location.baseDir))
    .map((entry) => ({
      path: path.isAbsolute(entry.path) ? path.relative(location.baseDir, entry.path) : entry.path,
      change: entry.change,
    }));
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
            entries: restoration.recovery,
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
  // An unrecorded file at a planned projection path is refused unless the
  // operator replaces it; the recovery replays this invocation with the
  // override, and only on a command that offers it.
  const outputPosture = yield* ProjectionOutputPosture;
  const failureSuggestions =
    firstFailed?.error === undefined
      ? undefined
      : firstFailed.error.problem?.code === "projection-output-unrecorded" &&
          outputPosture.replaceUnrecorded === false
        ? [
            ...namedPolicyRecoverySuggestions(applyExecution.approvalRecovery, [
              REPLACE_UNRECORDED_FLAG,
            ]),
            ...(firstFailed.error.suggestions ?? []),
          ]
        : firstFailed.error.suggestions;
  // The operation-level failure names the unit's settled message and keeps
  // everything else the unit's rendered failure states, so the operation
  // reports the same title, problem, evidence, and recoveries a command
  // boundary would print for that failure.
  const failure =
    firstFailed?.error === undefined
      ? undefined
      : makeStepFailure({
          category: firstFailed.error.category,
          title: firstFailed.error.title,
          detail: firstFailed.message ?? firstFailed.error.detail,
          problem: firstFailed.error.problem,
          metadata: firstFailed.error.metadata,
          retryable: firstFailed.error.retryable,
          inputs: firstFailed.error.inputs,
          suggestions: failureSuggestions,
          cause: firstFailed.error,
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
          suggestions: failureSuggestions ?? candidatePlan.failureSuggestions,
        }),
  });
});

export const resolveExecutionCandidate = <Requirements, Output>(
  candidate: ExecutionCandidate<Requirements, Output>,
  execution: PlanExecution,
  options?: ResolveExecutionCandidateOptions<Requirements, Output>,
) => Effect.scoped(resolveExecutionCandidateInScope(candidate, execution, options));

/**
 * Every failure preparing and then resolving an execution candidate can
 * surface: the workspace reads the candidate is planned and revalidated
 * against, the approval and interaction refusals, and the transition an apply
 * could not acquire. Step failures travel inside the resolution rather than
 * being raised. Derived from both phases, so it follows them exactly.
 */
export type PlanResolutionFailure =
  | Effect.Error<ReturnType<typeof prepareExecutionCandidate<never, never>>>
  | Effect.Error<ReturnType<typeof resolveExecutionCandidate<never, never>>>;
