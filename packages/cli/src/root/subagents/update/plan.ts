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
import * as Option from "effect/Option";
import type { AppError } from "@axm.sh/core/unstable/app-error";
import type { SubagentLockEntry } from "@axm.sh/core/unstable/lockfile";
import type { SubagentExtensionRef } from "@axm.sh/core/unstable/subagents";
import type { JobStepResult, Plan, PlannedJobStep } from "@axm.sh/core/unstable/workspace";

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

interface SubagentLockfile {
  readonly lockfileVersion: number;
  readonly subagents: Record<string, SubagentLockEntry>;
}

// -----------------------------------------------------------------------------
// Version comparison
// -----------------------------------------------------------------------------

/**
 * Determine whether a subagent needs updating by comparing the operation's
 * resolved metadata against the lockfile entry.
 *
 * Returns `true` when the subagent has changed and should be updated.
 */
const hasChanged = (op: UpdateOperation, entry: SubagentLockEntry): boolean => {
  const { ref } = op;

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
  lockfile: SubagentLockfile,
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
        const entry = lockfile.subagents[op.ref.subagent.name];
        const needsUpdate = !entry || op.force || hasChanged(op, entry);

        if (!needsUpdate) {
          return {
            readiness: "ready",
            label: op.ref.subagent.name,
            run: Effect.succeed<JobStepResult>({
              result: "success",
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
