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
import { createDefaultSettings, type Settings } from "../settings/index.js";
import { applyPlan } from "./apply-plan.js";
import { isExecutionCandidateFresh, makeExecutionCandidate } from "./execution-candidate.js";
import { augmentPlanWithReconciliation, type LockfileState } from "../workspace/augment-plan.js";
import { scanPlanReadiness } from "../workspace/scan-plan-readiness.js";
import { ReconciliationAdapters } from "../workspace/reconciliation.js";
import type {
  ReconcileExtensionType,
  ReconciliationAdapter,
} from "../workspace/reconciliation-types.js";
import type {
  CancelledPlan,
  ExecutedPlan,
  FailedPlan,
  JobExecutionPolicy,
  Plan,
  PlannedJobStep,
  PreviewedPlan,
} from "./plan.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import { getAxmDir } from "../workspace/paths.js";
import { AgentRootResolverLive } from "../workspace/read-model/agent-root-resolver.js";
import {
  makeWorkspaceReadModel,
  WorkspaceReadModelConfig,
} from "../workspace/read-model/service.js";
import { skillReconciliationAdapter } from "../skills/reconciliation-adapter.js";
import { hookReconciliationAdapter } from "../hooks/reconciliation-adapter.js";
import { knowledgeReconciliationAdapter } from "../knowledge/reconciliation-adapter.js";
import { mcpServerReconciliationAdapter } from "../mcps/reconciliation-adapter.js";
import { packReconciliationAdapter } from "../packs/reconciliation-adapter.js";
import { ruleReconciliationAdapter } from "../rules/reconciliation-adapter.js";
import { subagentReconciliationAdapter } from "../subagents/reconciliation-adapter.js";
import { displayPlan } from "../workspace/display-plan.js";
import { makeAbsolutePath } from "../utils/path-types.js";
import { ResolvePlanInteraction } from "../workspace/resolve-plan-interaction.js";
import { isNonInteractiveOptional, Verbosity } from "../cli-flags/index.js";
import {
  confirmationRecoverySuggestions,
  namedPolicyRecoverySuggestions,
  type PlanExecution,
} from "../cli-runtime/confirmation-recovery.js";
import type { PromptCancelled } from "../cli-prompt/prompt-cancelled.js";

// Total over ReconcileExtensionType: a missing key is a compile error, so a
// type can never again be silently dropped from lockfile reconciliation.
const reconciliationAdaptersByType = {
  skills: skillReconciliationAdapter,
  mcps: mcpServerReconciliationAdapter,
  subagents: subagentReconciliationAdapter,
  rules: ruleReconciliationAdapter,
  hooks: hookReconciliationAdapter,
  knowledge: knowledgeReconciliationAdapter,
  packs: packReconciliationAdapter,
} satisfies Record<ReconcileExtensionType, ReconciliationAdapter>;

const reconciliationAdapters = Object.values(reconciliationAdaptersByType);

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
export const previewOrApplyPlan = Effect.fn("previewOrApplyPlan")(function* (
  plan: Plan,
  options: {
    execution: PlanExecution;
    displayApplied?: boolean;
  },
) {
  const ws = yield* WorkspaceMutations;
  const renderer = yield* CliRenderer;
  const verbosity = yield* Verbosity;

  // Capture FS layer for augmentPlan
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const fsLayer = Layer.mergeAll(
    Layer.succeed(FileSystem.FileSystem, fs),
    Layer.succeed(Path.Path, path),
  );
  const reconciliationAdaptersLayer = Layer.succeed(ReconciliationAdapters, reconciliationAdapters);
  const globalDir = yield* getAxmDir("user");
  const contextEnv = Layer.mergeAll(
    fsLayer,
    Layer.succeed(WorkspaceReadModelConfig, {
      projectRoot: makeAbsolutePath(path, ws.baseDir),
      userHome: makeAbsolutePath(path, path.dirname(globalDir)),
      allowedRoot: makeAbsolutePath(path, "/"),
    }),
    AgentRootResolverLive.pipe(Layer.provide(fsLayer)),
  );

  const getLockfileState = (): Effect.Effect<LockfileState, AppError> => ws.getLockfileState();

  const readSettingsSafe = (dir: string): Effect.Effect<Settings, AppError> =>
    makeWorkspaceReadModel(dir === globalDir ? "user" : "project").pipe(
      Effect.flatMap((readModel) => readModel.state.settings),
      Effect.provide(contextEnv),
      Effect.map(Option.getOrElse(() => createDefaultSettings())),
      Effect.mapError((error) =>
        makeAppError({
          code: "validation",
          detail: "Workspace settings could not be read",
          cause: error,
        }),
      ),
    );

  const showPlan = (targetPlan: Plan | ExecutedPlan) =>
    displayPlan(targetPlan).pipe(Effect.provide(Layer.succeed(CliRenderer, renderer)));

  // Step 1: Lockfile reconciliation
  const augmented = yield* renderer.withSpinner(
    `Resolving ${plan.name}`,
    () =>
      augmentPlanWithReconciliation(
        plan,
        getLockfileState,
        ws.baseDir,
        ws.path,
        readSettingsSafe,
        fsLayer,
      ).pipe(Effect.provide(reconciliationAdaptersLayer)),
    { successMessage: `Resolved ${plan.name}` },
  );

  const augmentedPlan = augmented.plan;

  // Step 2: Scan readiness and construct semantic risk conditions.
  const readiness = scanPlanReadiness(augmentedPlan);
  const readinessBlockers = augmentedPlan.jobs.flatMap((job) =>
    job.steps.flatMap((step) =>
      step.readiness === "error"
        ? [
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
  const candidatePlan: Plan = {
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
    readonly suggestions?: FailedPlan["suggestions"];
    readonly executionSteps?: FailedPlan["executionSteps"];
  }): FailedPlan => ({
    _tag: "FailedPlan",
    name: candidatePlan.name,
    description: candidatePlan.description,
    ...(candidatePlan.releaseAge === undefined ? {} : { releaseAge: candidatePlan.releaseAge }),
    jobs: candidatePlan.jobs,
    reason: options.reason,
    errorCode: options.errorCode,
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
    });
  }
  const blocked = riskConditions.find((condition) => condition.level === "blocked");
  if (blocked !== undefined) {
    return failedPlan({ reason: "hard-blocked", errorCode: blocked.errorCode });
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
    } satisfies PreviewedPlan;
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
      } satisfies CancelledPlan;
    }
  }

  // Step 6: Revalidate under the local transaction lock and apply the exact candidate.
  let attemptedExecution: ExecutedPlan | undefined;
  const applyCandidate = Effect.gen(function* () {
    if (!(yield* isExecutionCandidateFresh(candidate).pipe(Effect.provide(fsLayer)))) {
      return yield* makeAppError({
        code: "conflict",
        detail: "The execution candidate became stale before apply.",
      });
    }
    const result = yield* applyPlan(candidate.plan);
    attemptedExecution = result;
    const failedStep = result.jobs
      .flatMap((job) => job.steps)
      .find((step) => step.result.result === "error");
    if (
      candidatePlan.executionCapabilities?.rollback !== "non-rollbackable" &&
      failedStep !== undefined &&
      failedStep.result.result === "error"
    ) {
      return yield* makeAppError({
        code: failedStep.result.error.code,
        detail: failedStep.result.message,
        cause: failedStep.result.error,
        ...(failedStep.result.error.suggestions === undefined
          ? {}
          : { suggestions: failedStep.result.error.suggestions }),
      });
    }
    return { ...result, candidateId: candidate.id } satisfies ExecutedPlan;
  });
  const guardedApply =
    candidatePlan.executionCapabilities?.rollback === "non-rollbackable"
      ? applyCandidate
      : ws.runTransaction({
          targets: [],
          transition: applyCandidate,
          validate: () => Effect.void,
        });
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
    const staleCandidate =
      applyResult.error.code === "conflict" &&
      applyResult.error.detail === "The execution candidate became stale before apply.";
    const executionSteps = attemptedExecution?.jobs.flatMap((job) =>
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
      errorCode: applyResult.error.code,
      suggestions: staleCandidate
        ? [{ description: "Rerun the command to resolve a fresh candidate." }]
        : applyResult.error.suggestions,
      ...(executionSteps === undefined ? {} : { executionSteps }),
    });
  }
  const executed = applyResult.value;
  if (options.displayApplied !== false) {
    yield* showPlan(executed);
  }
  return executed;
});

// ---------------------------------------------------------------------------
// Narrow resolver — lint-fix composition path
// ---------------------------------------------------------------------------

/**
 * Arguments for {@link resolvePlan}.
 */
export interface ResolvePlanArgs {
  readonly name: string;
  readonly description?: string;
  readonly steps: ReadonlyArray<PlannedJobStep>;
  readonly concurrency?: "unbounded" | number;
  readonly executionPolicy?: JobExecutionPolicy;
}

/**
 * Wrap an array of already-resolved {@link PlannedJobStep}s into a single-job
 * {@link Plan}.
 *
 * `resolvePlan` is the narrow resolver consumed by `axm lint --fix`. The lint
 * runner hands a fully-resolved `PlannedJobStep[]` — each step already carries
 * its own `run` closure wired against the per-extension
 * {@link OperationHandler}s — and `resolvePlan` wraps them into a `Plan` that
 * `applyPlan` can execute directly, without invoking the reconciliation-adapter
 * augmentation {@link previewOrApplyPlan} performs for install/uninstall flows.
 *
 * Consumers that need lockfile reconciliation (install, uninstall, pack) keep
 * calling `previewOrApplyPlan`; lint-fix composes the narrower pipeline
 * described in `contributing/guides/lint-rule-authoring.md` ("Writing `fix`"):
 * `collectFixOperations → resolvePlan → applyPlan`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const resolvePlan = (args: ResolvePlanArgs): Plan => ({
  _tag: "Plan" as const,
  name: args.name,
  description:
    args.description !== undefined && args.description.length > 0
      ? Option.some(args.description)
      : Option.none(),
  jobs: [
    {
      concurrency: args.concurrency ?? 1,
      ...(args.executionPolicy === undefined ? {} : { executionPolicy: args.executionPolicy }),
      steps: args.steps,
    },
  ],
});
