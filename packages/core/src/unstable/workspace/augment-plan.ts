/**
 * Augment a plan with lockfile reconciliation steps.
 *
 * Pure business logic: detects lockfile state and prepends recovery steps
 * when the lockfile is missing or invalid. Returns an augmented result
 * with reconciliation metadata, leaving CLI rendering to the caller.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { DEFAULT_PROFILE } from "../settings/index.js";
import { type AppError } from "../app-error/index.js";
import type { Settings } from "../settings/index.js";
import type { Plan, PlannedJobStep } from "../plan/plan.js";
import type { ReconciliationContext } from "./reconciliation-types.js";
import { runReadRecoverOperation, runReconcileMaterializeOperation } from "./reconciliation.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/** Lockfile health state used for reconciliation decisions. */
export type LockfileState = "ok" | "missing" | "invalid";

export type DegradedLockfileState = Exclude<LockfileState, "ok">;

export interface AugmentedPlanResult {
  readonly plan: Plan;
  readonly reconciliationTriggered: boolean;
  readonly reason?: DegradedLockfileState;
}

// -----------------------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------------------

/**
 * Augment a plan with lockfile reconciliation steps when the lockfile is
 * missing or invalid. Returns the plan unchanged when lockfile is ok.
 *
 * The caller is responsible for CLI-specific behavior (e.g., warning
 * the user when lockfile is invalid).
 */
export const augmentPlanWithReconciliation = (
  plan: Plan,
  getLockfileState: () => Effect.Effect<LockfileState, AppError>,
  baseDir: string,
  workspaceDir: string,
  readSettingsSafe: (dir: string) => Effect.Effect<Settings, AppError>,
  fsLayer: Layer.Layer<FileSystem.FileSystem | Path.Path>,
): Effect.Effect<AugmentedPlanResult, AppError> =>
  Effect.gen(function* () {
    const lockfileState = yield* getLockfileState();

    if (lockfileState === "ok") {
      return {
        plan,
        reconciliationTriggered: false,
      };
    }

    const reason: DegradedLockfileState = lockfileState;
    const settings = yield* readSettingsSafe(workspaceDir);
    const reconciliationContext: ReconciliationContext = {
      baseDir,
      now: new Date(),
      defaultProfile: settings.profile ?? DEFAULT_PROFILE,
      agents: settings.agents ?? [],
      settings,
    };

    const readRecoverStep: PlannedJobStep = {
      readiness: "ready",
      label: `Recover lockfile (${reason})`,
      run: runReadRecoverOperation(reconciliationContext).pipe(Effect.provide(fsLayer)),
    };

    const materializeStep: PlannedJobStep = {
      readiness: "ready",
      label: `Reconcile lockfile (${reason})`,
      run: runReconcileMaterializeOperation(reconciliationContext, workspaceDir, reason, {
        allowMissingDeclarations: true,
      }).pipe(Effect.provide(fsLayer)),
    };

    return {
      plan: {
        ...plan,
        jobs: [
          {
            concurrency: 1 as const,
            steps: [readRecoverStep, materializeStep],
          },
          ...plan.jobs,
        ],
      },
      reconciliationTriggered: true,
      reason,
    };
  });
