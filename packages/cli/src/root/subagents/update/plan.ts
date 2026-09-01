/**
 * Update-specific plan builder for subagents.
 *
 * Compares re-resolved source metadata against lockfile entries to determine
 * which subagents need updating. Registry sources compare versions, git sources
 * compare tree hashes, and local sources always update.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import type { AppError } from "@agentxm/extension-management/unstable/app-error";
import type { SubagentExtensionRef } from "@agentxm/extension-management/unstable/workspace";
import type {
  JobStepResult,
  Plan,
  PlannedJobStep,
} from "@agentxm/extension-management/unstable/plan";
import type {
  SubagentLockEntry,
  SubagentsLockMap,
} from "@agentxm/extension-management/unstable/lockfile";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface UpdateOperation {
  readonly ref: SubagentExtensionRef;
  readonly force: boolean;
}

/**
 * A function that creates a run closure for an operation.
 * The closure must have all services already provided (R = never).
 */
export type MakeRunClosure = (op: UpdateOperation) => Effect.Effect<JobStepResult, AppError, never>;

// -----------------------------------------------------------------------------
// Version comparison
// -----------------------------------------------------------------------------

/**
 * Determine whether a subagent needs updating by comparing the operation's
 * resolved metadata against the lockfile entry.
 *
 * Returns `true` when the subagent has changed and should be updated.
 */
const hasChanged = (op: UpdateOperation, accepted: SubagentLockEntry): boolean => {
  const { ref } = op;

  if (ref.refType === "git-hosted") {
    return !(
      accepted.type !== "registry" &&
      accepted.type !== "local" &&
      accepted.resolvedTree === ref.gitTreeSha
    );
  }

  if (ref.refType === "registry") {
    return accepted.type !== "registry" || ref.version !== accepted.resolvedVersion;
  }

  // Local sources: always update (no version tracking)
  return true;
};

// -----------------------------------------------------------------------------
// Plan builder
// -----------------------------------------------------------------------------

/**
 * Build an update plan by comparing operations against lockfile entries.
 *
 * Takes a `makeRunClosure` function that produces service-provided run closures
 * for each operation.
 *
 * Pure function (no Effect needed) — service provision happens in the caller.
 */
export const buildUpdatePlan = (
  ops: ReadonlyArray<UpdateOperation>,
  acceptedResolutions: SubagentsLockMap,
  name: string,
  description: Option.Option<string>,
  makeRunClosure: MakeRunClosure,
): Plan => ({
  _tag: "Plan",
  name,
  description,
  jobs: [
    {
      concurrency: "unbounded",
      steps: ops.map((op): PlannedJobStep => {
        const accepted = acceptedResolutions[op.ref.subagent.name];
        const needsUpdate = accepted === undefined || op.force || hasChanged(op, accepted);

        if (!needsUpdate) {
          return {
            readiness: "ready",
            label: op.ref.subagent.name,
            run: Effect.succeed<JobStepResult>({
              result: "success",
              disposition: "unchanged",
              message: "already up to date",
            }),
          };
        }

        return {
          readiness: "ready",
          label: op.ref.subagent.name,
          run: makeRunClosure(op),
        };
      }),
    },
  ],
});
