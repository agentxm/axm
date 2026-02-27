/**
 * Skill uninstall command workflow actions.
 *
 * Implements `UninstallExtensionCommandWorkflowActions` for the skill uninstall
 * command. The live layer captures all required services at construction time
 * so action methods satisfy the `R = never` contract.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { Log } from "../../../clack-effect/index.js";
import { Workspace } from "../../../workspace/index.js";
import { expandGlob } from "../../../skills/index.js";
import { SkillManager } from "../../../extensions/skills/manager.js";
import { buildUninstallOperation } from "../../../workflows/uninstall-operation/workflow.js";
import type {
  SkillExtensionTarget,
  UninstallRetentionPolicy,
} from "../../../workflows/install-operation/workflow.js";
import type { UninstallExtensionCommandWorkflowActions } from "../../../workflows/uninstall-command/workflow.js";
import type { CliError } from "../../../cli-error/index.js";
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
  /** Skip confirmations */
  readonly yes: boolean;
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

export class UninstallSkillCommandWorkflowActions extends Context.Tag(
  "UninstallSkillCommandWorkflowActions",
)<
  UninstallSkillCommandWorkflowActions,
  UninstallExtensionCommandWorkflowActions<
    UninstallHandlerArgs,
    ParsedSkillUninstallArgs,
    UninstallSkillCommandIntent
  >
>() {}

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
    const log = yield* Log;
    const skillMgr = yield* SkillManager;

    const parseArgs = (
      args: UninstallHandlerArgs,
    ): Effect.Effect<ParsedSkillUninstallArgs, CliError> =>
      Effect.gen(function* () {
        yield* log.info("axm skills uninstall");

        // Load installed skills for glob expansion
        const taxonomyInstalled = yield* ws.getInstalledSkills();
        const installedNames = Object.keys(taxonomyInstalled);

        // Expand glob pattern against installed skill names (excludes ignored)
        const skillNames = expandGlob(args.skill, installedNames);

        // Handle glob matching zero skills
        if (args.skill.includes("*") && skillNames.length === 0) {
          yield* log.warn(`No skills matched pattern "${args.skill}"`);
          yield* log.success("Nothing to uninstall.");
          return { skills: [] } satisfies ParsedSkillUninstallArgs;
        }

        // For literal names not in installed set, still include them
        const names = skillNames.length > 0 ? skillNames : [args.skill];

        return { skills: names } satisfies ParsedSkillUninstallArgs;
      });

    const finalizeIntent = (
      parsed: ParsedSkillUninstallArgs,
    ): Effect.Effect<UninstallSkillCommandIntent, CliError> =>
      Effect.succeed({
        skillsToUninstall: parsed.skills.map((skillName) => ({ skillName })),
      } satisfies UninstallSkillCommandIntent);

    const buildUninstallPlan = (
      intent: UninstallSkillCommandIntent,
    ): Effect.Effect<Plan, CliError> =>
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
