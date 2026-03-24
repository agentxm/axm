/**
 * Shared uninstall operation workflow.
 *
 * Builds PlannedJobStep entries for uninstall operations with
 * retention-check semantics (keep on disk if still required by a pack).
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type { AppError } from "../../app-error/index.js";
import type { JobStepResult, PlannedJobStep } from "../../workspace/plan.js";
import type { ExtensionRef } from "../../sources/index.js";
import {
  type ExtensionManager,
  type ExtensionTargetFor,
  type UninstallRetentionPolicy,
  toLabel,
} from "../install-operation/workflow.js";

// -----------------------------------------------------------------------------
// Uninstall Operation Args
// -----------------------------------------------------------------------------

export interface UninstallOperationArgs<TRef extends ExtensionRef> {
  readonly target: ExtensionTargetFor<TRef>;
}

// -----------------------------------------------------------------------------
// Uninstall Operation
// -----------------------------------------------------------------------------

/**
 * Execute the uninstall sequence with retention check.
 *
 * If the target is still required by an installed pack:
 *   1. Remove settings entry
 *   2. Mark dependency as retained in lockfile
 *
 * If not required:
 *   1. Unmaterialize from disk
 *   2. Remove lockfile entry
 *   3. Remove settings entry
 */
const runUninstallOperation = <TRef extends ExtensionRef>(
  manager: ExtensionManager<TRef>,
  retentionPolicy: UninstallRetentionPolicy,
  args: UninstallOperationArgs<TRef>,
): Effect.Effect<JobStepResult, AppError, never> =>
  Effect.gen(function* () {
    const stillRequiredByPack = yield* retentionPolicy.isRequiredByInstalledPack({
      target: args.target,
    });

    if (stillRequiredByPack) {
      yield* manager.removeSettingsEntry({ target: args.target });
      yield* retentionPolicy.markDependencyRetainedInLockfile({ target: args.target });
      return {
        result: "success" as const,
        message: "Kept on disk because dependency is still required by an installed pack",
      } satisfies JobStepResult;
    }

    yield* manager.materializeUninstall({ target: args.target });
    yield* manager.removeLockfileEntry({ target: args.target });
    yield* manager.removeSettingsEntry({ target: args.target });
    return {
      result: "success" as const,
      message: "Applied uninstall operation",
    } satisfies JobStepResult;
  });

/**
 * Build a PlannedJobStep for an uninstall operation.
 *
 * The step captures the manager, retention policy, and target in its `run`
 * closure so execution requires no runtime service resolution (`R = never`).
 */
export const buildUninstallOperation = <TRef extends ExtensionRef>(
  manager: ExtensionManager<TRef>,
  retentionPolicy: UninstallRetentionPolicy,
  args: UninstallOperationArgs<TRef>,
): PlannedJobStep => {
  return {
    label: toLabel(args.target),
    readiness: "ready",
    run: runUninstallOperation(manager, retentionPolicy, args),
  } satisfies PlannedJobStep;
};
