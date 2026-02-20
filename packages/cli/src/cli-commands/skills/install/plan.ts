/**
 * Skills-specific plan builder.
 *
 * Builds install operations from selected skill refs and diffs them against
 * current lockfile state to produce a Plan.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { Plan, PlannedJobStep } from "../../../workspace/plan.js";
import {
  SourceHostProviders,
  type SkillExtensionRef,
  type Source,
} from "../../../sources/index.js";
import { Workspace } from "../../../workspace/index.js";
import type { InstallSkillOperation } from "../../../extensions/skills/operations/install.js";

/**
 * Args for building an install plan.
 */
export interface BuildSkillInstallPlanArgs {
  readonly selectedSkills: ReadonlyArray<SkillExtensionRef>;
  readonly source: Source;
  readonly force: boolean;
  readonly versionConstraint: Option.Option<string>;
}

/**
 * Build a plan by computing install operations and comparing against lockfile state.
 */
export const buildSkillInstallPlan = ({
  selectedSkills,
  source,
  force,
  versionConstraint,
}: BuildSkillInstallPlanArgs) =>
  Effect.gen(function* () {
    const workspace = yield* Workspace;
    const sources = yield* SourceHostProviders;
    const lockedSkills = yield* workspace.getLockedSkills();

    const ops = selectedSkills.map(
      (ref) =>
        ({
          name: "install-skill",
          args: {
            ref,
            force,
            versionConstraint: ref.refType === "registry" ? versionConstraint : Option.none(),
            skipSettings: Option.none(),
          },
        }) satisfies InstallSkillOperation,
    );

    return {
      name: "Install skill(s)",
      description: Option.some(`Install skills from ${sources.origin(source)}`),
      jobs: [
        {
          concurrency: 1,
          steps: ops.map((op) => {
            const installed = Object.hasOwn(lockedSkills, op.args.ref.skill.name);
            return installed && !op.args.force
              ? ({
                  _tag: "PlannedJobStep",
                  operation: op,
                  readiness: { status: "skip", message: "already installed" },
                  label: op.args.ref.skill.name,
                } satisfies PlannedJobStep<InstallSkillOperation>)
              : ({
                  _tag: "PlannedJobStep",
                  operation: op,
                  readiness: { status: "ready", message: Option.none() },
                  label: op.args.ref.skill.name,
                } satisfies PlannedJobStep<InstallSkillOperation>);
          }),
        },
      ],
    } satisfies Plan<InstallSkillOperation>;
  });
