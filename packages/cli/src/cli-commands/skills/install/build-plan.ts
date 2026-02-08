/**
 * Skills-specific plan builder.
 *
 * Diffs AddSkillOperations against lockfile state to produce a Plan.
 * New skills become expected-success steps; already-installed skills become expected-no-op steps.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import type { Lockfile } from "../../../lockfile/schema.js";
import type { Plan } from "../../../workspace/plan.js";
import type { AddSkillOperation } from "../operations.js";

/**
 * Build a plan by comparing operations against the lockfile.
 *
 * Pure function — no Effect needed.
 */
export const buildPlan = (
  ops: ReadonlyArray<AddSkillOperation>,
  lockfile: Lockfile,
  name: string,
  description: Option.Option<string>,
): Plan<AddSkillOperation> => ({
  name,
  description,
  jobs: [
    {
      concurrency: 1,
      steps: ops.map((op) => {
        const installed = op.args.skill.name in lockfile.skills;
        return installed && !op.args.force
          ? {
              _tag: "PlannedJobStep" as const,
              operation: op,
              expectedResult: { result: "no-op" as const, message: "already installed" },
              label: op.args.skill.name,
            }
          : {
              _tag: "PlannedJobStep" as const,
              operation: op,
              expectedResult: {
                result: "success" as const,
                message: `Installed ${op.args.skill.name}`,
              },
              label: op.args.skill.name,
            };
      }),
    },
  ],
});
