/**
 * Pack-specific uninstall plan builder.
 *
 * Diffs UninstallPackOperations against lockfile state to produce a Plan.
 * Installed packs become expected-success steps; missing packs become expected-no-op steps.
 *
 * Also detects orphaned extensions that are no longer referenced by any
 * remaining pack or direct settings entry.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import type { Lockfile, PackLockEntry } from "../../../lockfile/schema.js";
import type { SkillsMap } from "../../../settings/schema.js";
import type { Plan, PlannedJobStep } from "../../../workspace/plan.js";
import type { UninstallPackOperation } from "../../../extensions/packs/operations/uninstall.js";

/**
 * Identifies skill FQNs that become orphaned after removing a pack.
 *
 * A skill is orphaned if:
 * 1. It is in the removed pack's resolvedSkills
 * 2. It is NOT in any other remaining pack's resolvedSkills
 * 3. It is NOT a direct entry in settings skills map
 *
 * Pure function.
 */
export const findOrphanedSkills = (
  removedPackEntry: PackLockEntry,
  remainingPacks: Readonly<Record<string, PackLockEntry>>,
  configuredSkills: SkillsMap,
): ReadonlyArray<string> => {
  const removedSkills = Object.keys(removedPackEntry.resolvedSkills);

  // Collect all skills referenced by remaining packs
  const otherPackSkills = new Set<string>();
  for (const entry of Object.values(remainingPacks)) {
    for (const fqn of Object.keys(entry.resolvedSkills)) {
      otherPackSkills.add(fqn);
    }
  }

  // Filter to skills that are truly orphaned
  return removedSkills.filter((fqn) => !otherPackSkills.has(fqn) && !(fqn in configuredSkills));
};

/**
 * Identifies command FQNs that become orphaned after removing a pack.
 *
 * Pure function.
 */
export const findOrphanedCommands = (
  removedPackEntry: PackLockEntry,
  remainingPacks: Readonly<Record<string, PackLockEntry>>,
): ReadonlyArray<string> => {
  const removedCommands = Object.keys(removedPackEntry.resolvedCommands);

  const otherPackCommands = new Set<string>();
  for (const entry of Object.values(remainingPacks)) {
    for (const fqn of Object.keys(entry.resolvedCommands)) {
      otherPackCommands.add(fqn);
    }
  }

  return removedCommands.filter((fqn) => !otherPackCommands.has(fqn));
};

/**
 * Identifies MCP server FQNs that become orphaned after removing a pack.
 *
 * Pure function.
 */
export const findOrphanedMcpServers = (
  removedPackEntry: PackLockEntry,
  remainingPacks: Readonly<Record<string, PackLockEntry>>,
): ReadonlyArray<string> => {
  const removedServers = Object.keys(removedPackEntry.resolvedMcpServers);

  const otherPackServers = new Set<string>();
  for (const entry of Object.values(remainingPacks)) {
    for (const fqn of Object.keys(entry.resolvedMcpServers)) {
      otherPackServers.add(fqn);
    }
  }

  return removedServers.filter((fqn) => !otherPackServers.has(fqn));
};

/**
 * Build an uninstall plan by comparing pack operations against the lockfile.
 *
 * Pure function — no Effect needed.
 */
export const buildUninstallPlan = (
  ops: ReadonlyArray<UninstallPackOperation>,
  lockfile: Lockfile,
  name: string,
  description: Option.Option<string>,
): Plan<UninstallPackOperation> => ({
  name,
  description,
  jobs: [
    {
      concurrency: 1,
      steps: ops.map((op): PlannedJobStep<UninstallPackOperation> => {
        const lockedPacks = lockfile.packs ?? {};
        const installed = Object.hasOwn(lockedPacks, op.args.packName);
        return installed
          ? {
              _tag: "PlannedJobStep",
              operation: op,
              expectedResult: {
                result: "success",
                message: `Uninstalled pack ${op.args.packName}`,
              },
              label: op.args.packName,
            }
          : {
              _tag: "PlannedJobStep",
              operation: op,
              expectedResult: { result: "no-op", message: "not installed" },
              label: op.args.packName,
            };
      }),
    },
  ],
});
