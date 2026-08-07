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
import { Verbosity } from "../cli-flags/index.js";

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
 * 3. Fail closed on readiness errors
 * 4. Display the exact plan that would execute
 * 5. Preview, or confirm unless --yes
 * 6. Apply and display results
 */
export const previewOrApplyPlan = Effect.fn("previewOrApplyPlan")(function* (
  plan: Plan,
  flags: {
    yes: boolean;
    preview: boolean;
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

  // Step 2: Scan readiness
  const readiness = scanPlanReadiness(augmentedPlan);

  // Step 3: Handle errors
  if (readiness.hasErrors) {
    yield* showPlan(augmentedPlan);
    return yield* makeAppError({
      code: "conflict",
      detail: "Plan has errors that prevent execution",
    });
  }

  // Step 4: Display the same augmented plan for preview and apply. A quiet,
  // pre-confirmed apply has no confirmation boundary and remains silent.
  if (flags.preview || !flags.yes || verbosity.level !== "quiet") {
    yield* showPlan(augmentedPlan);
  }

  // Step 5: Preview or confirm
  if (flags.preview) {
    return {
      _tag: "PreviewedPlan",
      name: augmentedPlan.name,
      description: augmentedPlan.description,
      ...(augmentedPlan.preconditions === undefined
        ? {}
        : { preconditions: augmentedPlan.preconditions }),
      jobs: augmentedPlan.jobs,
    } satisfies PreviewedPlan;
  }

  const hasSteps = augmentedPlan.jobs.some((job) => job.steps.length > 0);
  if (!flags.yes && hasSteps) {
    const interaction = yield* ResolvePlanInteraction;
    const confirmed = yield* interaction.confirmApplyChanges();
    if (!confirmed) {
      return {
        _tag: "CancelledPlan",
        name: augmentedPlan.name,
        description: augmentedPlan.description,
        ...(augmentedPlan.preconditions === undefined
          ? {}
          : { preconditions: augmentedPlan.preconditions }),
        jobs: augmentedPlan.jobs,
      } satisfies CancelledPlan;
    }
  }

  // Step 6: Apply and display
  const executed = yield* renderer.withSpinner(
    `Applying ${augmentedPlan.name}`,
    () => applyPlan(augmentedPlan),
    { successMessage: `Processed ${augmentedPlan.name}` },
  );
  if (flags.displayApplied !== false) {
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
