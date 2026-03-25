/**
 * Skill uninstall command workflow actions.
 *
 * Implements `UninstallExtensionCommandWorkflowActions` for the skill uninstall
 * command. The live layer captures all required services at construction time
 * so action methods satisfy the `R = never` contract.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { Workspace } from "../../../workspace/index.js";
import { expandGlob } from "@axm.sh/core/unstable/utils";
import { SkillManager } from "../../../extensions/skills/manager.js";
import { buildUninstallOperation } from "../../../workflows/uninstall-operation/workflow.js";
import type {
  SkillExtensionTarget,
  UninstallRetentionPolicy,
} from "../../../workflows/install-operation/workflow.js";
import type { UninstallExtensionCommandWorkflowActions } from "../../../workflows/uninstall-command/workflow.js";
import type { AppError } from "@axm.sh/core/unstable/app-error";
import type { Plan, PlannedJobStep } from "../../../workspace/plan.js";
import type { UninstallSkillCommandIntent } from "./intent.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Raw handler args for the uninstall command.
 */
export interface UninstallHandlerArgs {
  /** Name or glob pattern of the skill to uninstall */
  readonly skill: string;
}

/**
 * Parsed and validated skill uninstall arguments.
 */
export interface ParsedSkillUninstallArgs {
  readonly skills: ReadonlyArray<string>;
}

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

export class UninstallSkillCommandWorkflowActions extends ServiceMap.Service<
  UninstallSkillCommandWorkflowActions,
  UninstallExtensionCommandWorkflowActions<
    UninstallHandlerArgs,
    ParsedSkillUninstallArgs,
    UninstallSkillCommandIntent
  >
>()("@axm.sh/cli/UninstallSkillCommandWorkflowActions") {}

// -----------------------------------------------------------------------------
// Live Layer
// -----------------------------------------------------------------------------

/**
 * Constructs the actions by resolving all services at layer-build time.
 * Each action method closes over the captured services so `R = never`.
 */
export const UninstallSkillCommandWorkflowActionsLive = Layer.effect(
  UninstallSkillCommandWorkflowActions,
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const renderer = yield* CliRenderer;
    const skillMgr = yield* SkillManager;

    const parseArgs = (
      args: UninstallHandlerArgs,
    ): Effect.Effect<ParsedSkillUninstallArgs, AppError> =>
      Effect.gen(function* () {
        yield* renderer.info("axm skills uninstall");

        // Load installed skills for glob expansion
        const taxonomyInstalled = yield* ws.getInstalledSkills();
        const installedNames = Object.keys(taxonomyInstalled);

        // Expand glob pattern against installed skill names (excludes ignored)
        const skillNames = expandGlob(args.skill, installedNames);

        // Handle glob matching zero skills
        if (args.skill.includes("*") && skillNames.length === 0) {
          yield* renderer.warn(`No skills matched pattern "${args.skill}"`);
          yield* renderer.success("Nothing to uninstall.");
          return { skills: [] } satisfies ParsedSkillUninstallArgs;
        }

        // For literal names not in installed set, still include them
        const names = skillNames.length > 0 ? skillNames : [args.skill];

        return { skills: names } satisfies ParsedSkillUninstallArgs;
      });

    const finalizeIntent = (
      parsed: ParsedSkillUninstallArgs,
    ): Effect.Effect<UninstallSkillCommandIntent, AppError> =>
      Effect.succeed({
        skillsToUninstall: parsed.skills.map((skillName) => ({ skillName })),
      } satisfies UninstallSkillCommandIntent);

    const buildUninstallPlan = (
      intent: UninstallSkillCommandIntent,
    ): Effect.Effect<Plan, AppError> =>
      Effect.gen(function* () {
        // Build retention policy from workspace service
        const retentionPolicy: UninstallRetentionPolicy = {
          isRequiredByInstalledPack: (policyArgs) =>
            ws.isExtensionRequiredByInstalledPack(policyArgs.target),
          markDependencyRetainedInLockfile: (policyArgs) =>
            ws.markDependencyRetainedInLockfile(policyArgs.target),
        };

        // Read lockfile for target resolution
        const lockedSkills = yield* ws.getLockedSkills();

        // Resolve targets manually: installed skills get uninstall operations,
        // not-in-lockfile skills get no-op success steps
        const steps: PlannedJobStep[] = intent.skillsToUninstall.map((entry) => {
          if (!(entry.skillName in lockedSkills)) {
            return {
              readiness: "ready",
              label: entry.skillName,
              run: Effect.succeed({
                result: "success" as const,
                message: `${entry.skillName} not installed`,
              }),
            } satisfies PlannedJobStep;
          }
          const target: SkillExtensionTarget = {
            type: "skill" as const,
            name: entry.skillName,
          };
          return buildUninstallOperation(skillMgr, retentionPolicy, { target });
        });

        return {
          _tag: "Plan",
          name: "Uninstall skill(s)",
          description: Option.none(),
          jobs: [
            {
              concurrency: 1 as const,
              steps,
            },
          ],
        } satisfies Plan;
      });

    return {
      parseArgs,
      finalizeIntent,
      buildUninstallPlan,
    };
  }),
);
