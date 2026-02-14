/**
 * Pack-specific install plan builder.
 *
 * Diffs install operations against lockfile state to produce a Plan.
 * Supports both pack and skill install operations.
 * New items become expected-success steps; already-installed items become expected-no-op steps.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import type { Lockfile } from "../../../lockfile/schema.js";
import type { Plan, PlannedJobStep } from "../../../workspace/plan.js";
import type { InstallSkillOperation } from "../../skills/operations.js";
import type { InstallPackOperation } from "../operations.js";

/**
 * Union of operation types accepted by the pack install plan builder.
 */
export type PackInstallOp = InstallPackOperation | InstallSkillOperation;

/**
 * Build a plan by comparing install operations against the lockfile.
 *
 * Pure function — no Effect needed.
 */
export const buildInstallPlan = <T extends PackInstallOp>(
  ops: ReadonlyArray<T>,
  lockfile: Lockfile,
  name: string,
  description: Option.Option<string>,
): Plan<T> => ({
  name,
  description,
  jobs: [
    {
      concurrency: 1,
      steps: ops.map((op): PlannedJobStep<T> => {
        if (op.name === "install-pack") {
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
        }
        // install-skill
        const installed = Object.hasOwn(lockfile.skills, op.args.skill.name);
        return installed
          ? {
              _tag: "PlannedJobStep",
              operation: op,
              expectedResult: { result: "no-op", message: "already installed" },
              label: op.args.skill.name,
            }
          : {
              _tag: "PlannedJobStep",
              operation: op,
              expectedResult: {
                result: "success",
                message: `Installed skill ${op.args.skill.name}`,
              },
              label: op.args.skill.name,
            };
      }),
    },
  ],
});
