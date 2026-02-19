/**
 * Uninstall-specific plan builder.
 *
 * Diffs UninstallSkillOperations against lockfile state to produce a Plan.
 * Installed skills become expected-success steps; missing skills become expected-no-op steps.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import type { Lockfile } from "../../../lockfile/schema.js";
import type { Plan } from "../../../workspace/plan.js";
import type { UninstallSkillOperation } from "../../../extensions/skills/operations/uninstall.js";

/**
 * Build a plan by comparing operations against the lockfile.
 *
 * Pure function — no Effect needed.
 */
export const buildSkillUninstallPlan = (
  ops: ReadonlyArray<UninstallSkillOperation>,
  lockfile: Lockfile,
  name: string,
  description: Option.Option<string>,
): Plan<UninstallSkillOperation> => ({
  name,
  description,
  jobs: [
    {
      concurrency: 1,
      steps: ops.map((op) => {
        const installed = op.args.skillName in lockfile.skills;
        return installed
          ? {
              _tag: "PlannedJobStep",
              operation: op,
              expectedResult: {
                result: "success",
                message: `Uninstalled ${op.args.skillName}`,
              },
              label: op.args.skillName,
            }
          : {
              _tag: "PlannedJobStep",
              operation: op,
              expectedResult: { result: "no-op", message: "not installed" },
              label: op.args.skillName,
            };
      }),
    },
  ],
});
