/**
 * Pack-specific install plan builder.
 *
 * Diffs InstallPackOperations against lockfile state to produce a Plan.
 * New packs become expected-success steps; already-installed packs become expected-no-op steps.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import type { Lockfile } from "../../../lockfile/schema.js";
import type { Plan, PlannedJobStep } from "../../../workspace/plan.js";
import type { InstallPackOperation } from "../operations.js";

/**
 * Build a plan by comparing pack operations against the lockfile.
 *
 * Pure function — no Effect needed.
 */
export const buildInstallPlan = (
  ops: ReadonlyArray<InstallPackOperation>,
  lockfile: Lockfile,
  name: string,
  description: Option.Option<string>,
): Plan<InstallPackOperation> => ({
  name,
  description,
  jobs: [
    {
      concurrency: 1,
      steps: ops.map((op): PlannedJobStep<InstallPackOperation> => {
        const lockedPacks = lockfile.packs ?? {};
        const installed = Object.hasOwn(lockedPacks, op.args.packName);
        return installed
          ? {
              _tag: "PlannedJobStep",
              operation: op,
              expectedResult: { result: "no-op", message: "already installed" },
              label: op.args.packName,
            }
          : {
              _tag: "PlannedJobStep",
              operation: op,
              expectedResult: {
                result: "success",
                message: `Installed pack ${op.args.packName}`,
              },
              label: op.args.packName,
            };
      }),
    },
  ],
});
