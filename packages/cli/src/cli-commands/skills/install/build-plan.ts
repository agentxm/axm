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
import type { Plan, PlannedJobStep } from "../../../workspace/plan.js";
import type { InstallSkillOperation } from "../operations.js";

/**
 * Build a plan by comparing operations against the lockfile.
 *
 * Pure function — no Effect needed.
 */
export const buildPlan = (
  ops: ReadonlyArray<InstallSkillOperation>,
  lockfile: Lockfile,
  name: string,
  description: Option.Option<string>,
): Plan<InstallSkillOperation> => ({
  name,
  description,
  jobs: [
    {
      concurrency: 1,
      steps: ops.map((op) => {
        const installed = Object.hasOwn(lockfile.skills, op.args.ref.skill.name);
        return installed && !op.args.force
          ? ({
              _tag: "PlannedJobStep",
              operation: op,
              expectedResult: { result: "no-op", message: "already installed" },
              label: op.args.ref.skill.name,
            } satisfies PlannedJobStep<InstallSkillOperation>)
          : ({
              _tag: "PlannedJobStep",
              operation: op,
              expectedResult: {
                result: "success",
                message: `Installed ${op.args.ref.skill.name}`,
              },
              label: op.args.ref.skill.name,
            } satisfies PlannedJobStep<InstallSkillOperation>);
      }),
    },
  ],
});
