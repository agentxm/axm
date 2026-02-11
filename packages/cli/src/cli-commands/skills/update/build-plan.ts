/**
 * Update-specific plan builder.
 *
 * Compares re-resolved source metadata against lockfile entries to determine
 * which skills need updating. Git sources compare tree hashes, registry sources
 * compare versions, and local sources always update.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import type { Lockfile, SkillLockEntry } from "../../../lockfile/schema.js";
import type { Plan, PlannedJobStep } from "../../../workspace/plan.js";
import type { InstallSkillOperation } from "../operations.js";

// -----------------------------------------------------------------------------
// Git hosting source types that use gitTreeHash comparison
// -----------------------------------------------------------------------------

const GIT_SOURCE_TYPES = new Set(["github", "gitlab", "bitbucket", "azurerepos", "git"]);

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
  if (GIT_SOURCE_TYPES.has(entry.type)) {
    const lockHash = Option.fromNullable(entry.gitTreeHash);
    const opHash = op.args.gitTreeSha;

    // If either hash is missing, treat as needing update
    if (Option.isNone(lockHash) || Option.isNone(opHash)) return true;

    return lockHash.value !== opHash.value;
  }

  if (entry.type === "registry") {
    const lockVersion = entry.resolvedVersion;
    return Option.match(op.args.version, {
      onNone: () => true,
      onSome: (opVersion) => opVersion !== lockVersion,
    });
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
 * Pure function -- no Effect needed.
 */
export const buildUpdatePlan = (
  ops: ReadonlyArray<InstallSkillOperation>,
  lockfile: Lockfile,
  name: string,
  description: Option.Option<string>,
): Plan<InstallSkillOperation> => ({
  name,
  description,
  jobs: [
    {
      concurrency: "unbounded",
      steps: ops.map((op) => {
        const entry = lockfile.skills[op.args.skill.name];
        const needsUpdate = !entry || op.args.force || hasChanged(op, entry);

        return needsUpdate
          ? ({
              _tag: "PlannedJobStep",
              operation: op,
              expectedResult: {
                result: "success",
                message: `Updated ${op.args.skill.name}`,
              },
              label: op.args.skill.name,
            } satisfies PlannedJobStep<InstallSkillOperation>)
          : ({
              _tag: "PlannedJobStep",
              operation: op,
              expectedResult: { result: "no-op", message: "already up to date" },
              label: op.args.skill.name,
            } satisfies PlannedJobStep<InstallSkillOperation>);
      }),
    },
  ],
});
