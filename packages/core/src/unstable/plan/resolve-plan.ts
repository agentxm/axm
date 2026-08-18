/**
 * Plan preview/apply function.
 *
 * Orchestrates `augmentPlanWithReconciliation`, `scanPlanReadiness`,
 * and `applyPlan` with `displayPlan` and interactive prompts.
 *
 * This is a free function, not a method on WorkspaceMutationsService.
 *
 * @experimental This API is unstable and may change without notice.
 */

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
import type { CancelledPlan, ExecutedPlan, FailedPlan, Plan, PreviewedPlan } from "./plan.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
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
 * Preview or apply (display, confirm, and execute) a plan using the workspace read model.
 *
 * Steps:
 * 1. Augment plan with lockfile reconciliation if needed
 * 2. Scan for errors/warnings
 * 3. Construct and display the exact candidate
 * 4. Fail closed on blockers and missing named policies
 * 5. Preview or approve confirmable semantic risk
 * 6. Revalidate and apply the same candidate
 */
export const previewOrApplyPlan = Effect.fn("previewOrApplyPlan")(function* <Requirements, Output>(
  plan: Plan<Requirements, Output>,
  options: {
    execution: PlanExecution;
    displayApplied?: boolean;
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

  const getLockfileState = (): Effect.Effect<LockfileState, AppError> => ws.getLockfileState();

  const showPlan = (targetPlan: Plan<Requirements, Output> | ExecutedPlan<Output>) =>
    displayPlan(targetPlan).pipe(Effect.provide(Layer.succeed(CliRenderer, renderer)));

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
    ...(riskConditions.length === 0
      ? {}
      : {
          sections: [
            ...(augmentedPlan.sections ?? []),
            {
              title: "Execution conditions",
              items: riskConditions.map((condition) => condition.detail),
            },
          ],
        }),
  };
  const candidate = yield* makeExecutionCandidate(candidatePlan, ws.path, ws.baseDir).pipe(
    Effect.provide(fsLayer),
  );

  const failedPlan = (options: {
    readonly reason: FailedPlan["reason"];
    readonly errorCode: FailedPlan["errorCode"];
    readonly failure?: AppError;
    readonly suggestions?: FailedPlan["suggestions"];
    readonly executionSteps?: FailedPlan["executionSteps"];
  }): FailedPlan<Requirements, Output> => ({
    _tag: "FailedPlan",
    name: candidatePlan.name,
    description: candidatePlan.description,
    ...(candidatePlan.releaseAge === undefined ? {} : { releaseAge: candidatePlan.releaseAge }),
    jobs: candidatePlan.jobs,
    reason: options.reason,
    errorCode: options.errorCode,
    ...(options.failure === undefined ? {} : { failure: options.failure }),
    ...(candidatePlan.preconditions === undefined
      ? {}
      : { preconditions: candidatePlan.preconditions }),
    ...(riskConditions.length === 0 ? {} : { riskConditions }),
    candidateId: candidate.id,
    ...(options.suggestions === undefined ? {} : { suggestions: options.suggestions }),
    ...(options.executionSteps === undefined ? {} : { executionSteps: options.executionSteps }),
  });

  // Step 3: Display the immutable candidate before any policy terminal or effect.
  const hasConfirmableRisk = riskConditions.some((condition) => condition.level === "confirmable");
  if (
    options.execution.request.mode === "preview" ||
    verbosity.level !== "quiet" ||
    hasConfirmableRisk
  ) {
    yield* showPlan(candidatePlan);
  }

  // Step 4: Hard blockers dominate preview, overrides, and confirmation.
  if (readiness.hasErrors) {
    return failedPlan({
      reason: "hard-blocked",
      errorCode: "conflict",
      ...(candidatePlan.failureSuggestions === undefined
        ? {}
        : { suggestions: candidatePlan.failureSuggestions }),
    });
  }
  const blocked = riskConditions.find((condition) => condition.level === "blocked");
  if (blocked !== undefined) {
    return failedPlan({
      reason: "hard-blocked",
      errorCode: blocked.errorCode,
      ...(candidatePlan.failureSuggestions === undefined
        ? {}
        : { suggestions: candidatePlan.failureSuggestions }),
    });
  }

  // Step 5: Preview is speculative and never grants approval to a later invocation.
  if (options.execution.request.mode === "preview") {
    return {
      _tag: "PreviewedPlan",
      name: candidatePlan.name,
      description: candidatePlan.description,
      ...(candidatePlan.releaseAge === undefined ? {} : { releaseAge: candidatePlan.releaseAge }),
      ...(candidatePlan.preconditions === undefined
        ? {}
        : { preconditions: candidatePlan.preconditions }),
      ...(riskConditions.length === 0 ? {} : { riskConditions }),
      candidateId: candidate.id,
      jobs: candidatePlan.jobs,
    } satisfies PreviewedPlan<Requirements, Output>;
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
    return failedPlan({
      reason: "override-required",
      errorCode: "usage",
      suggestions: namedPolicyRecoverySuggestions(
        applyExecution.approvalRecovery,
        missingOverrides.map((condition) => condition.requiredFlag),
      ),
    });
  }

  const hasSteps = candidatePlan.jobs.some((job) => job.steps.length > 0);
  if (
    hasSteps &&
    hasConfirmableRisk &&
    applyExecution.request.confirmableRiskApproval === "prompt-if-interactive"
  ) {
    if (yield* isNonInteractiveOptional) {
      return failedPlan({
        reason: "approval-required",
        errorCode: "usage",
        suggestions: confirmationRecoverySuggestions(applyExecution.approvalRecovery),
      });
    }
    const interaction = yield* ResolvePlanInteraction;
    const confirmed = yield* interaction
      .confirmApplyChanges(applyExecution.approvalRecovery)
      .pipe(Effect.catchTag("PromptCancelled", (_error: PromptCancelled) => Effect.succeed(false)));
    if (!confirmed) {
      return {
        _tag: "CancelledPlan",
        name: candidatePlan.name,
        description: candidatePlan.description,
        ...(candidatePlan.releaseAge === undefined ? {} : { releaseAge: candidatePlan.releaseAge }),
        ...(candidatePlan.preconditions === undefined
          ? {}
          : { preconditions: candidatePlan.preconditions }),
        ...(riskConditions.length === 0 ? {} : { riskConditions }),
        candidateId: candidate.id,
        jobs: candidatePlan.jobs,
      } satisfies CancelledPlan<Requirements, Output>;
    }
  }

  // Step 6: Revalidate under the local transaction lock and apply the exact candidate.
  const applyFreshCandidate = Effect.gen(function* () {
    if (!(yield* isExecutionCandidateFresh(candidate).pipe(Effect.provide(fsLayer)))) {
      return yield* makeAppError({
        code: "conflict",
        detail: "The execution candidate became stale before apply.",
      });
    }
    if (options.beforeApply !== undefined) {
      yield* options.beforeApply(candidate);
      if (!(yield* isExecutionCandidateFresh(candidate).pipe(Effect.provide(fsLayer)))) {
        return yield* makeAppError({
          code: "conflict",
          detail: "The execution candidate became stale before apply.",
        });
      }
    }
    return yield* applyPlan(candidate.plan);
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
  const guardedApply = (
    candidatePlan.executionCapabilities?.rollback === "non-rollbackable"
      ? applyCandidate
      : ws.runTransaction({
          targets: [],
          transition: applyCandidate,
          validate: () => Effect.void,
        })
  ).pipe(
    Effect.mapError((failure): PlanApplyFailure<Output> =>
      "error" in failure ? failure : { error: failure },
    ),
  );
  const applyResult = yield* renderer.withSpinner(
    `Applying ${candidatePlan.name}`,
    () =>
      guardedApply.pipe(
        Effect.match({
          onFailure: (error) => ({ type: "failure", error }) as const,
          onSuccess: (value) => ({ type: "success", value }) as const,
        }),
      ),
    { successMessage: `Processed ${candidatePlan.name}` },
  );
  if (applyResult.type === "failure") {
    const failure = applyResult.error.error;
    const staleCandidate =
      failure.code === "conflict" &&
      failure.detail === "The execution candidate became stale before apply.";
    const executionSteps = applyResult.error.attemptedExecution?.jobs.flatMap((job) =>
      job.steps.map((step) => {
        if (step.result.result === "success") {
          return {
            label: step.label,
            status: "rolled-back" as const,
            message: `${step.result.message}; rolled back`,
          };
        }
        const unapplied = step.result.message.includes("blocked by");
        return {
          label: step.label,
          status: unapplied ? ("unapplied" as const) : ("failed" as const),
          message: step.result.message,
        };
      }),
    );
    return failedPlan({
      reason: staleCandidate ? "stale-candidate" : "execution-failed",
      errorCode: failure.code,
      failure,
      suggestions: staleCandidate
        ? [{ description: "Rerun the command to resolve a fresh candidate." }]
        : failure.suggestions,
      ...(executionSteps === undefined ? {} : { executionSteps }),
    });
  }
  const executed = applyResult.value;
  if (options.displayApplied !== false) {
    yield* showPlan(executed);
  }
  return executed;
});
