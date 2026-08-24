/**
 * Plan preview/apply function.
 *
 * Orchestrates `augmentPlanWithReconciliation`, `scanPlanReadiness`,
 * and `applyPlan` with `displayPlan` and interactive prompts, and produces
 * one `OperationResolution` at every termination path. Channels project the
 * returned resolution; this boundary renders only transient planning output.
 *
 * This is a free function, not a method on WorkspaceMutationsService.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Cause from "effect/Cause";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { CliRenderer } from "../cli-renderer/index.js";
import { makeAppError, type AppError } from "../app-error/index.js";
import { applyPlan } from "./apply-plan.js";
import {
  isExecutionCandidateFresh,
  makeExecutionCandidate,
  type ExecutionCandidate,
} from "./execution-candidate.js";
import { augmentPlanWithReconciliation, type LockfileState } from "../workspace/augment-plan.js";
import { scanPlanReadiness } from "../workspace/scan-plan-readiness.js";
import type { CompletedJobStep, ExecutedPlan, Plan } from "./plan.js";
import {
  declaredAtomicity,
  executedUnits,
  makeOperationResolution,
  plannedUnits,
  unitIdOf,
  type OperationBlock,
  type OperationResolution,
  type ResolvedUnit,
} from "./operation-resolution.js";
import {
  appendCompletedUnit,
  recordOperationJournal,
  updateOperationJournal,
} from "./operation-journal.js";
import {
  publishLifecycleEvent,
  publishPhaseStarted,
  subscribeToLifecycle,
} from "./operation-events.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import {
  restorationIncompleteToAppError,
  WorkspaceRestorationIncomplete,
} from "../workspace/transaction.js";
import { requestedInterruptionSignal } from "../cli-runtime/interruption.js";
import { readFootprint } from "../workspace/footprint-recorder.js";
import type { OperationFootprintEntry } from "./operation-resolution.js";
import { displayPlan } from "../workspace/display-plan.js";
import { ResolvePlanInteraction } from "../workspace/resolve-plan-interaction.js";
import { isNonInteractiveOptional, Verbosity } from "../cli-flags/index.js";
import type { ConfiguredAgentOperation } from "../cli-runtime/confirmation-recovery.js";
import { HookManager } from "../hooks/manager.js";
import { isMcpServerApplicableToAgent } from "../mcps/targeting.js";
import { configuredAgentLifecycleOutcomes } from "../workspace/configured-agent-outcomes.js";
import {
  confirmationRecoverySuggestions,
  namedPolicyRecoverySuggestions,
  type PlanExecution,
} from "../cli-runtime/confirmation-recovery.js";
import type { PromptCancelled } from "../cli-prompt/prompt-cancelled.js";
import type { ConfiguredAgentOutcome } from "./plan.js";

interface PlanApplyFailure<Output> {
  readonly error: AppError;
  readonly attemptedExecution?: ExecutedPlan<Output>;
  /** The typed restoration-failure fact; present only when rollback did not complete. */
  readonly restoration?: WorkspaceRestorationIncomplete;
}

export const STALE_CANDIDATE_DETAIL = "The execution candidate became stale before apply.";

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
 * Preview or apply (display, confirm, and execute) a plan using the workspace read model.
 *
 * Steps:
 * 1. Augment plan with lockfile reconciliation if needed
 * 2. Scan for errors/warnings
 * 3. Construct and display the exact candidate
 * 4. Fail closed on blockers and missing named policies
 * 5. Preview or approve confirmable semantic risk
 * 6. Revalidate and apply the same candidate
 *
 * Every termination path resolves to one `OperationResolution`.
 */
export const previewOrApplyPlan = Effect.fn("previewOrApplyPlan")(function* <Requirements, Output>(
  plan: Plan<Requirements, Output>,
  options: {
    execution: PlanExecution;
    beforeApply?: (
      candidate: ExecutionCandidate<Requirements, Output>,
    ) => Effect.Effect<void, AppError, Requirements>;
  },
) {
  const ws = yield* WorkspaceMutations;
  const renderer = yield* CliRenderer;
  const verbosity = yield* Verbosity;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const fsLayer = Layer.mergeAll(
    Layer.succeed(FileSystem.FileSystem, fs),
    Layer.succeed(Path.Path, path),
  );

  const mode = options.execution.request.mode;

  const getLockfileState = (): Effect.Effect<LockfileState, AppError> => ws.getLockfileState();

  yield* publishPhaseStarted("planning");

  // Step 1: Lockfile reconciliation
  const augmented = yield* renderer.withSpinner(
    `Resolving ${plan.name}`,
    () => augmentPlanWithReconciliation(plan, getLockfileState),
    { successMessage: `Resolved ${plan.name}` },
  );

  const operations = options.execution.configuredAgentOperations ?? [];
  const configuredAgents = operations.length === 0 ? [] : yield* ws.getConfiguredAgents();
  const configuredMcpServers = operations.some(
    ({ extensionType }) => extensionType === "mcp-server",
  )
    ? yield* ws.getConfiguredMcpServerEntries()
    : {};
  const hookManager = yield* Effect.serviceOption(HookManager);
  const outcomesFor = (
    operation: ConfiguredAgentOperation,
    state: "projected" | "current",
  ): Effect.Effect<ReadonlyArray<ConfiguredAgentOutcome>, AppError> => {
    const mcpEntry =
      operation.extensionType === "mcp-server" ? configuredMcpServers[operation.name] : undefined;
    const generic = configuredAgentLifecycleOutcomes({
      type: operation.extensionType,
      name: operation.name,
      agentIds: configuredAgents,
      scope: ws.scope,
      state,
      enabled: operation.targetEnabled,
      installed: state === "projected",
      observedAgentIds: state === "projected" ? configuredAgents : [],
      ...(mcpEntry === undefined
        ? {}
        : {
            applicableAgentIds: configuredAgents.filter((agentId) =>
              isMcpServerApplicableToAgent(mcpEntry, agentId),
            ),
          }),
    });
    if (
      operation.targetEnabled &&
      operation.extensionType === "hook" &&
      Option.isSome(hookManager) &&
      hookManager.value.configuredAgentOutcomes !== undefined
    ) {
      return hookManager.value.configuredAgentOutcomes(state).pipe(
        Effect.map((outcomes) => outcomes.filter(({ name }) => name === operation.name)),
        Effect.map((outcomes) => (outcomes.length === 0 ? generic : outcomes)),
        Effect.catch(() => Effect.succeed(generic)),
      );
    }
    return Effect.succeed(generic);
  };
  const projectedOutcomes = (yield* Effect.forEach(operations, (operation) =>
    outcomesFor(operation, "projected"),
  )).flat();
  const augmentedPlan =
    operations.length === 0
      ? augmented.plan
      : withPlannedAgentOutcomes(augmented.plan, projectedOutcomes);

  // Step 2: Scan readiness and construct semantic risk conditions.
  const readiness = scanPlanReadiness(augmentedPlan);
  const declaredConditionIds = new Set(
    (augmentedPlan.riskConditions ?? []).map((condition) => condition.id),
  );
  const readinessBlockers = augmentedPlan.jobs.flatMap((job) =>
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
    ...readinessBlockers,
    ...preconditionBlockers,
  ];
  const candidatePlan: Plan<Requirements, Output> = {
    ...augmentedPlan,
    ...(riskConditions.length === 0 ? {} : { riskConditions }),
  };
  const candidate = yield* makeExecutionCandidate(candidatePlan, ws.path, ws.baseDir).pipe(
    Effect.provide(fsLayer),
  );

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
    completed: [],
    restoresOnFailure: candidatePlan.executionCapabilities?.rollback !== "non-rollbackable",
    applying: false,
  });

  const notExecuted = (over: {
    readonly blocking?: OperationBlock;
    readonly declined?: boolean;
    readonly failure?: AppError;
    readonly units?: ReadonlyArray<ResolvedUnit<Output>>;
  }): OperationResolution<Output> =>
    makeOperationResolution<Output>({
      ...resolutionBase,
      atomicity: { declared: atomicity, applied: "candidate-atomic" },
      units: over.units ?? plannedUnits(candidatePlan.jobs),
      blocking: over.blocking,
      declined: over.declined,
      failure: over.failure,
      suggestions: candidatePlan.failureSuggestions,
    });

  // Step 3: Display the immutable candidate before any policy terminal or effect.
  if (mode === "preview") {
    yield* publishPhaseStarted("preview");
  }
  const hasConfirmableRisk = riskConditions.some((condition) => condition.level === "confirmable");
  if (mode === "preview" || verbosity.level !== "quiet" || hasConfirmableRisk) {
    yield* displayPlan(candidatePlan, { mode }).pipe(
      Effect.provide(Layer.succeed(CliRenderer, renderer)),
    );
  }

  // Step 4: Hard blockers dominate preview, overrides, and confirmation.
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

  // Step 5: Preview is speculative and never grants approval to a later invocation.
  if (options.execution.request.mode === "preview") {
    return makeOperationResolution<Output>({
      ...resolutionBase,
      atomicity: { declared: atomicity, applied: "candidate-atomic" },
      units: plannedUnits(candidatePlan.jobs),
    });
  }

  if (!("approvalRecovery" in options.execution)) {
    return yield* makeAppError({
      code: "internal",
      detail: "Apply execution is missing approval recovery metadata",
    });
  }
  const applyExecution = options.execution;

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
      atomicity: { declared: atomicity, applied: "candidate-atomic" },
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

  const hasSteps = candidatePlan.jobs.some((job) => job.steps.length > 0);
  if (
    hasSteps &&
    hasConfirmableRisk &&
    applyExecution.request.confirmableRiskApproval === "prompt-if-interactive"
  ) {
    if (yield* isNonInteractiveOptional) {
      const confirmable = riskConditions.find((condition) => condition.level === "confirmable");
      const escapes = confirmationRecoverySuggestions(applyExecution.approvalRecovery);
      return makeOperationResolution<Output>({
        ...resolutionBase,
        atomicity: { declared: atomicity, applied: "candidate-atomic" },
        units: plannedUnits(candidatePlan.jobs),
        blocking: {
          class: "approval-required",
          subject: confirmable?.id ?? candidatePlan.name,
          phase: "confirmation",
          detail: confirmable?.detail ?? "This plan requires confirmation before it can apply.",
          ...(escapes[0] === undefined ? {} : { escape: escapes[0] }),
        },
        suggestions: escapes,
      });
    }
    const interaction = yield* ResolvePlanInteraction;
    yield* publishPhaseStarted("confirmation");
    const confirmed = yield* interaction
      .confirmApplyChanges(applyExecution.approvalRecovery)
      .pipe(Effect.catchTag("PromptCancelled", (_error: PromptCancelled) => Effect.succeed(false)));
    if (!confirmed) {
      return notExecuted({ declined: true });
    }
  }

  // Step 6: Acquire the workspace transition — planning, network acquisition,
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
  let startedUnits = 0;
  let resolvedUnits = 0;
  const applyFreshCandidate = Effect.gen(function* () {
    yield* publishPhaseStarted("validation");
    if (!(yield* isExecutionCandidateFresh(candidate).pipe(Effect.provide(fsLayer)))) {
      return yield* makeAppError({
        code: "conflict",
        detail: STALE_CANDIDATE_DETAIL,
      });
    }
    if (options.beforeApply !== undefined) {
      yield* options.beforeApply(candidate);
      if (!(yield* isExecutionCandidateFresh(candidate).pipe(Effect.provide(fsLayer)))) {
        return yield* makeAppError({
          code: "conflict",
          detail: STALE_CANDIDATE_DETAIL,
        });
      }
    }
    yield* updateOperationJournal((state) => ({ ...state, applying: true }));
    yield* publishPhaseStarted("apply");
    return yield* applyPlan(candidate.plan, {
      onStepStarted: (step) =>
        publishLifecycleEvent((atNanos) => ({
          _tag: "UnitStarted",
          unitId: step.key ?? step.label,
          label: step.label,
          index: startedUnits++,
          total: totalUnits,
          atNanos,
        })),
      onStepCompleted: (step) =>
        appendCompletedUnit(step).pipe(
          Effect.andThen(
            publishLifecycleEvent((atNanos) => ({
              _tag: "UnitResolved",
              unitId: unitIdOf(step),
              label: step.label,
              state: resolvedUnitState(step),
              index: resolvedUnits++,
              total: totalUnits,
              atNanos,
            })),
          ),
        ),
    });
  });
  const applyCandidate = Effect.gen(function* () {
    const result = yield* applyFreshCandidate.pipe(
      Effect.mapError((error) => ({ error }) satisfies PlanApplyFailure<Output>),
    );
    const failedStep = result.jobs
      .flatMap((job) => job.steps)
      .find((step) => step.result.result === "error");
    if (
      candidatePlan.executionCapabilities?.rollback !== "non-rollbackable" &&
      failedStep !== undefined &&
      failedStep.result.result === "error"
    ) {
      return yield* Effect.fail({
        error: makeAppError({
          code: failedStep.result.error.code,
          detail: failedStep.result.message,
          cause: failedStep.result.error,
          ...(failedStep.result.error.suggestions === undefined
            ? {}
            : { suggestions: failedStep.result.error.suggestions }),
        }),
        attemptedExecution: result,
      });
    }
    if (operations.length === 0) {
      return { ...result, candidateId: candidate.id } satisfies ExecutedPlan<Output>;
    }
    const currentOutcomes = (yield* Effect.forEach(operations, (operation) =>
      operation.targetEnabled &&
      operation.extensionType === "hook" &&
      Option.isSome(hookManager) &&
      hookManager.value.configuredAgentOutcomes !== undefined
        ? hookManager.value
            .configuredAgentOutcomes("current")
            .pipe(Effect.map((outcomes) => outcomes.filter(({ name }) => name === operation.name)))
        : operation.targetEnabled
          ? ws.records.getExtensionInventory(operation.extensionType, {}).pipe(
              Effect.map(
                (inventory) =>
                  inventory.items.find((item) => item.name === operation.name)?.agentOutcomes ??
                  configuredAgentLifecycleOutcomes({
                    type: operation.extensionType,
                    name: operation.name,
                    agentIds: configuredAgents,
                    scope: ws.scope,
                    state: "current",
                    enabled: true,
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
                enabled: false,
                installed: false,
              }),
            ),
    )).flat();
    const incomplete = currentOutcomes.find(
      ({ outcome }) => outcome === "blocked" || outcome === "failed",
    );
    const executedWithOutcomes = withExecutedAgentOutcomes(result, currentOutcomes);
    if (incomplete !== undefined) {
      return yield* Effect.fail({
        error: makeAppError({
          code: "conflict",
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
    value.error._tag === "AppError";
  const guardedApply = (
    candidatePlan.executionCapabilities?.rollback === "non-rollbackable"
      ? applyCandidate
      : ws.runTransaction({
          targets: [],
          transition: applyCandidate,
          validate: () => Effect.void,
          onRestorationStarted: publishPhaseStarted("restoration"),
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
          error: innerApplyFailure?.error ?? restorationIncompleteToAppError(failure),
          ...(innerApplyFailure?.attemptedExecution === undefined
            ? {}
            : { attemptedExecution: innerApplyFailure.attemptedExecution }),
          restoration: failure,
        };
      }
      return "error" in failure ? failure : { error: failure };
    }),
  );
  const applyResult = yield* Effect.scoped(
    Effect.gen(function* () {
      const contention = yield* ws.acquireTransition({
        command: applyExecution.approvalRecovery.command.join(" "),
        candidateId: candidate.id,
        onWaiting: (holder) =>
          renderer.step(
            `Waiting: resource-conflict — workspace transition held by ${Option.match(holder, {
              onNone: () => "another operation",
              onSome: (value) => `${value.command} (pid ${value.pid})`,
            })}`,
          ),
      });
      if (Option.isSome(contention)) {
        return { type: "contention", contention: contention.value } as const;
      }
      return yield* renderer.withSpinner(
        `Applying ${candidatePlan.name}`,
        (handle) =>
          Effect.scoped(
            subscribeToLifecycle((event) => {
              switch (event._tag) {
                case "UnitStarted":
                  return handle.update(
                    `Applying ${candidatePlan.name} — ${event.label} (${event.index + 1}/${event.total})`,
                    { unit: event.unitId, atMs: Number(event.atNanos / 1_000_000n) },
                  );
                case "UnitResolved":
                  return handle.update(
                    `Applying ${candidatePlan.name} — ${event.label}: ${event.state} (${event.index + 1}/${event.total})`,
                    {
                      unit: event.unitId,
                      state: event.state,
                      atMs: Number(event.atNanos / 1_000_000n),
                    },
                  );
                case "PhaseStarted":
                  return event.phase === "restoration"
                    ? handle.update(`Rolling back ${candidatePlan.name}`)
                    : Effect.void;
                case "Waiting":
                  return Effect.void;
              }
            }).pipe(
              Effect.andThen(
                guardedApply.pipe(
                  Effect.match({
                    onFailure: (error) => ({ type: "failure", error }) as const,
                    onSuccess: (value) => ({ type: "success", value }) as const,
                  }),
                ),
              ),
            ),
          ),
        { successMessage: `Processed ${candidatePlan.name}` },
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
      atomicity: { declared: atomicity, applied: "candidate-atomic" },
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
    const restored =
      candidatePlan.executionCapabilities?.rollback !== "non-rollbackable" && !rollbackFailed;
    const executed =
      attempted === undefined
        ? plannedUnits<Requirements, Output>(candidatePlan.jobs)
        : executedUnits(attempted, { restored });
    // When rollback failed, committed effects were retained as the failure
    // left them rather than restored — the unit disposition says so.
    const units = rollbackFailed
      ? executed.map((unit) =>
          unit.state === "committed" ? { ...unit, disposition: "retained" as const } : unit,
        )
      : executed;
    const staleCandidate = failure.code === "conflict" && failure.detail === STALE_CANDIDATE_DETAIL;
    const staleUnit = units.find((unit) => unit.blocking?.class === "stale-candidate");
    if (staleCandidate || staleUnit !== undefined) {
      return makeOperationResolution<Output>({
        ...resolutionBase,
        atomicity: { declared: atomicity, applied: "candidate-atomic" },
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
        applied: rollbackFailed
          ? "non-rollbackable"
          : restored && attempted !== undefined
            ? "candidate-atomic"
            : atomicity,
      },
      units,
      failure,
      footprint,
      ...(restorationRecovery === undefined ? {} : { recovery: restorationRecovery }),
      ...(restoration?.terminationCause === "interruption"
        ? {
            interruption: {
              signal: requestedInterruptionSignal() ?? "SIGINT",
              disposition: "retained",
            },
          }
        : {}),
      suggestions: failure.suggestions ?? candidatePlan.failureSuggestions,
    });
  }
  const executed = applyResult.value;
  return makeOperationResolution<Output>({
    ...resolutionBase,
    atomicity: { declared: atomicity, applied: atomicity },
    units: executedUnits(executed),
    footprint,
  });
});
