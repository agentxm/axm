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
import type { UninstallSkillOperation } from "../operations.js";

/**
 * Build a plan by comparing operations against the lockfile.
 *
 * Pure function — no Effect needed.
 */
export const buildPlan = (
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
              _tag: "PlannedJobStep" as const,
              operation: op,
              expectedResult: {
                result: "success" as const,
                message: `Uninstalled ${op.args.skillName}`,
              },
              label: op.args.skillName,
            }
          : {
              _tag: "PlannedJobStep" as const,
              operation: op,
              expectedResult: { result: "no-op" as const, message: "not installed" },
              label: op.args.skillName,
            };
      }),
    },
  ],
});
