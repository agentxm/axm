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
import type { ExecutedPlan, Plan, PlannedJobStep, PreviewedPlan } from "./plan.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import { getAxmDir } from "../workspace/paths.js";
import { AgentRootResolverLive } from "../workspace/read-model/agent-root-resolver.js";
import {
  makeWorkspaceReadModel,
  WorkspaceReadModelConfig,
} from "../workspace/read-model/service.js";
import { skillReconciliationAdapter } from "../skills/reconciliation-adapter.js";
import { commandReconciliationAdapter } from "../commands/reconciliation-adapter.js";
import { mcpServerReconciliationAdapter } from "../mcps/reconciliation-adapter.js";
import { packReconciliationAdapter } from "../packs/reconciliation-adapter.js";
import { subagentReconciliationAdapter } from "../subagents/reconciliation-adapter.js";
import { displayPlan } from "../workspace/display-plan.js";
import { makeAbsolutePath } from "../utils/path-types.js";

const reconciliationAdapters = [
  skillReconciliationAdapter,
  commandReconciliationAdapter,
  subagentReconciliationAdapter,
  mcpServerReconciliationAdapter,
  packReconciliationAdapter,
];

/**
 * Preview or apply (display, confirm, and execute) a plan using the workspace read model.
 *
 * Steps:
 * 1. Augment plan with lockfile reconciliation if needed
 * 2. Scan for errors/warnings
 * 3. Handle errors (block unless --force)
 * 4. Preview if requested (with confirmation unless --yes)
 * 5. Apply and display results
 */
export const previewOrApplyPlan = Effect.fn("previewOrApplyPlan")(function* (
  plan: Plan,
  flags: {
    yes: boolean;
    force: boolean;
    preview: boolean;
    blockedByErrorsHowToFix?: string;
    displayApplied?: boolean;
  },
) {
  const ws = yield* WorkspaceMutations;
  const renderer = yield* CliRenderer;

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
  const augmented = yield* augmentPlanWithReconciliation(
    plan,
    getLockfileState,
    ws.baseDir,
    ws.path,
    readSettingsSafe,
    fsLayer,
  ).pipe(Effect.provide(reconciliationAdaptersLayer));

  const augmentedPlan = augmented.plan;

  // Step 2: Scan readiness
  const readiness = scanPlanReadiness(augmentedPlan);

  // Step 3: Handle errors
  if (readiness.hasErrors) {
    if (flags.force) {
      // Forced error steps are applied as structured failed step results.
    } else {
      yield* showPlan(augmentedPlan);
      return yield* makeAppError({
        code: "conflict",
        detail: "Plan has errors that prevent execution",
        suggestions: [
          {
            description: flags.blockedByErrorsHowToFix ?? "Re-run with --force to override",
          },
        ],
      });
    }
  }

  // Step 5: Preview
  if (flags.preview) {
    yield* showPlan(augmentedPlan);

    return {
      _tag: "PreviewedPlan",
      name: augmentedPlan.name,
      description: augmentedPlan.description,
      jobs: augmentedPlan.jobs,
    } satisfies PreviewedPlan;
  }

  // Step 6: Apply and display
  const executed = yield* applyPlan(augmentedPlan);
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
  readonly concurrency?: "unbounded" | 1;
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
 * described in `docs/design/lint-engine.md §6`:
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
      steps: args.steps,
    },
  ],
});
