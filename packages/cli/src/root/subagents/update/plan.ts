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
import type { AppError } from "@agentxm/client-core/unstable/app-error";
import type { SubagentExtensionRef } from "@agentxm/client-core/unstable/subagents";
import type { JobStepResult, Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import {
  trustRecordKey,
  type ExtensionTrustRecord,
  type WorkspaceTrustState,
} from "@agentxm/client-core/unstable/trust";

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
const hasChanged = (op: UpdateOperation, trust: ExtensionTrustRecord): boolean => {
  const { ref } = op;

  if (ref.refType === "git-hosted") {
    const trustedRevision = Option.fromUndefinedOr(trust.immutableRevision);
    const opHash = ref.gitTreeSha;

    // If either hash is missing, treat as needing update
    if (Option.isNone(trustedRevision) || Option.isNone(opHash)) return true;

    return trustedRevision.value !== opHash.value;
  }

  if (ref.refType === "registry") {
    return (
      trust.authority !== "registry" ||
      trust.resolvedVersion === undefined ||
      ref.version !== trust.resolvedVersion
    );
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
  trustState: WorkspaceTrustState,
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
        const trust = trustState.records[trustRecordKey("subagent", op.ref.subagent.name)];
        const needsUpdate = trust === undefined || op.force || hasChanged(op, trust);

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
