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
import type { Lockfile, SkillLockEntry } from "@axm.sh/core/unstable/lockfile";
import type { LegacyPlan, LegacyPlannedStep } from "../../../workspace/plan-bridge.js";
import type { InstallSkillOperation } from "../../../extensions/skills/operations/install.js";
import type { UninstallSkillOperation } from "../../../extensions/skills/operations/uninstall.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type UpdateOperation = InstallSkillOperation | UninstallSkillOperation;

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
// Step builders
// -----------------------------------------------------------------------------

const buildInstallStep = (
  op: InstallSkillOperation,
  lockfile: Lockfile,
): LegacyPlannedStep<UpdateOperation> => {
  const entry = lockfile.skills[op.args.ref.skill.name];
  const needsUpdate = !entry || op.args.force || hasChanged(op, entry);

  return {
    _tag: "PlannedJobStep",
    operation: op,
    readiness: needsUpdate
      ? { status: "ready", message: Option.none() }
      : { status: "skip", message: "already up to date" },
    label: op.args.ref.skill.name,
  };
};

const buildUninstallStep = (op: UninstallSkillOperation): LegacyPlannedStep<UpdateOperation> => ({
  _tag: "PlannedJobStep",
  operation: op,
  readiness: { status: "ready", message: Option.none() },
  label: `${op.args.skillName} (renamed)`,
});

// -----------------------------------------------------------------------------
// Plan builder
// -----------------------------------------------------------------------------

/**
 * Build an update plan by comparing operations against lockfile entries.
 *
 * Accepts both install operations (compared against lockfile) and uninstall
 * operations (rename cleanup — always marked as success).
 *
 * Pure function -- no Effect needed.
 */
export const buildUpdatePlan = (
  ops: ReadonlyArray<UpdateOperation>,
  lockfile: Lockfile,
  name: string,
  description: Option.Option<string>,
): LegacyPlan<UpdateOperation> => ({
  name,
  description,
  jobs: [
    {
      concurrency: "unbounded",
      steps: ops.map((op) =>
        op.name === "install-skill" ? buildInstallStep(op, lockfile) : buildUninstallStep(op),
      ),
    },
  ],
});
