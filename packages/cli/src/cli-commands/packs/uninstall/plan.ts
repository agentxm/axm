/**
 * Pack-specific uninstall plan builder.
 *
 * Diffs UninstallPackOperations against lockfile state to produce a Plan.
 * Installed packs become expected-success steps; missing packs become expected-no-op steps.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import type { Lockfile } from "../../../lockfile/schema.js";
import type { Plan, PlannedJobStep } from "../../../workspace/plan.js";
import type { UninstallPackOperation } from "../../../extensions/packs/operations/uninstall.js";

// Re-export orphan detection functions from their canonical location
export {
  findOrphanedSkills,
  findOrphanedCommands,
  findOrphanedMcpServers,
} from "../../../extensions/packs/operations/orphan-detection.js";

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
