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
import * as Option from "effect/Option";
import type { AppError } from "@axm.sh/core/unstable/app-error";
import type { Lockfile, SkillLockEntry } from "@axm.sh/core/unstable/lockfile";
import type { JobStepResult, Plan, PlannedJobStep } from "@axm.sh/core/unstable/workspace";
import type { InstallSkillOperation } from "@axm.sh/core/unstable/skills";
import type { UninstallSkillOperation } from "@axm.sh/core/unstable/skills";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type UpdateOperation = InstallSkillOperation | UninstallSkillOperation;

/**
 * A function that creates a run closure for an operation.
 * The closure must have all services already provided (R = never).
 */
export type MakeRunClosure = (op: UpdateOperation) => Effect.Effect<JobStepResult, AppError, never>;

// -----------------------------------------------------------------------------
// Version comparison
// -----------------------------------------------------------------------------

/**
 * Determine whether a skill needs updating by comparing the operation's
 * resolved metadata against the lockfile entry.
 *
 * Returns `true` when the skill has changed and should be updated.
 */
const hasChanged = (op: InstallSkillOperation, entry: SkillLockEntry): boolean => {
  const { ref } = op.args;

  if (ref.refType === "git-hosted") {
    const lockHash = Option.fromUndefinedOr(entry.gitTreeHash);
    const opHash = ref.gitTreeSha;

    // If either hash is missing, treat as needing update
    if (Option.isNone(lockHash) || Option.isNone(opHash)) return true;

    return lockHash.value !== opHash.value;
  }

  if (ref.refType === "registry") {
    if (entry.type !== "registry") return true;
    const lockVersion = entry.resolvedVersion;
    const opVersion = ref.version;
    return opVersion !== lockVersion;
  }

  if (ref.refType === "builtin") {
    // Builtin skills are updated via CLI version comparison, not here
    return false;
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
 * Accepts both install operations (compared against lockfile) and uninstall
 * operations (rename cleanup — always marked as success).
 *
 * Takes a `makeRunClosure` function that produces service-provided run closures
 * for each operation.
 *
 * Pure function (no Effect needed) — service provision happens in the caller.
 */
export const buildUpdatePlan = (
  ops: ReadonlyArray<UpdateOperation>,
  lockfile: Lockfile,
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
        if (op.name === "uninstall-skill") {
          return {
            readiness: "ready",
            label: `${op.args.skillName} (renamed)`,
            run: makeRunClosure(op),
          };
        }
        // install-skill
        const entry = lockfile.skills[op.args.ref.skill.name];
        const needsUpdate = !entry || op.args.force || hasChanged(op, entry);

        if (!needsUpdate) {
          return {
            readiness: "ready",
            label: op.args.ref.skill.name,
            run: Effect.succeed<JobStepResult>({
              result: "success",
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
