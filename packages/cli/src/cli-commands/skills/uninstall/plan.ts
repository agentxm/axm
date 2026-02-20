/**
 * Uninstall-specific plan builder.
 *
 * Diffs UninstallSkillOperations against lockfile state to produce a Plan.
 * Installed skills become expected-success steps; missing skills become expected-no-op steps.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import type { Record as EffectRecord } from "effect";
import type { Plan } from "../../../workspace/plan.js";
import type { UninstallSkillOperation } from "../../../extensions/skills/operations/uninstall.js";

/** Keyed by skill name. Presence = installed. */
export type InstalledSkills = EffectRecord.ReadonlyRecord<
  string,
  { readonly referencingPacks: ReadonlyArray<string> }
>;

/**
 * Build a plan by comparing operations against the lockfile.
 *
 * Pure function — no Effect needed.
 */
export const buildSkillUninstallPlan = (
  ops: ReadonlyArray<UninstallSkillOperation>,
  installed: InstalledSkills,
  name: string,
  description: Option.Option<string>,
): Plan<UninstallSkillOperation> => ({
  name,
  description,
  jobs: [
    {
      concurrency: 1,
      steps: ops.map((op) => {
        const entry = installed[op.args.skillName];
        if (entry === undefined) {
          return {
            _tag: "PlannedJobStep",
            operation: op,
            readiness: { status: "skip", message: "not installed" },
            label: op.args.skillName,
          };
        }
        if (entry.referencingPacks.length > 0) {
          const packs = entry.referencingPacks.join(", ");
          return {
            _tag: "PlannedJobStep",
            operation: op,
            readiness: {
              status: "error",
              message: `required by pack ${packs}. Use 'axm skills disable <skill>' instead`,
            },
            label: op.args.skillName,
          };
        }
        return {
          _tag: "PlannedJobStep",
          operation: op,
          readiness: { status: "ready", message: Option.none() },
          label: op.args.skillName,
        };
      }),
    },
  ],
});
