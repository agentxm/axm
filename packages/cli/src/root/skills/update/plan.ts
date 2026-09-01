/**
 * Update-specific plan builder.
 *
 * Compares re-resolved source metadata against lockfile entries to determine
 * which skills need updating. Git sources compare tree hashes, registry sources
 * compare versions, and local sources always update.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import type {
  JobStepResult,
  Plan,
  PlannedJobStep,
  StepFailure,
} from "@agentxm/workspace-operations";
import type { InstallSkillOperation } from "@agentxm/extension-lifecycle";
import type { SkillLockEntry, SkillsLockMap } from "@agentxm/workspace-state";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type UpdateOperation = InstallSkillOperation;

/**
 * A function that creates a run closure for an operation.
 * The closure must have all services already provided (R = never).
 */
export type MakeRunClosure = (
  op: UpdateOperation,
) => Effect.Effect<JobStepResult, StepFailure, never>;

// -----------------------------------------------------------------------------
// Version comparison
// -----------------------------------------------------------------------------

/**
 * Determine whether a skill needs updating by comparing the operation's
 * resolved metadata against the lockfile entry.
 *
 * Returns `true` when the skill has changed and should be updated.
 */
const hasChanged = (op: InstallSkillOperation, accepted: SkillLockEntry): boolean => {
  const { ref } = op.args;

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
  acceptedResolutions: SkillsLockMap,
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
        const accepted = acceptedResolutions[op.args.ref.skill.name];
        const needsUpdate = accepted === undefined || op.args.force || hasChanged(op, accepted);

        if (!needsUpdate) {
          return {
            readiness: "ready",
            label: op.args.ref.skill.name,
            run: Effect.succeed<JobStepResult>({
              result: "success",
              disposition: "unchanged",
              message: "already up to date",
            }),
          };
        }

        return {
          readiness: "ready",
          label: op.args.ref.skill.name,
          run: makeRunClosure(op),
        };
      }),
    },
  ],
});
