/**
 * Skills-specific plan builder.
 *
 * Diffs AddSkillOperations against lockfile state to produce a Plan.
 * New skills become "execute" actions; already-installed skills become "no-op".
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
              operation: op,
              action: "no-op" as const,
              reason: Option.some("already installed"),
              label: op.args.skill.name,
            }
          : {
              operation: op,
              action: "execute" as const,
              reason: Option.none(),
              label: op.args.skill.name,
            };
      }),
    },
  ],
});
