/**
 * Skill uninstall command workflow actions.
 *
 * Implements `UninstallExtensionCommandWorkflowActions` for the skill uninstall
 * command. The live layer captures all required services at construction time
 * so action methods satisfy the `R = never` contract.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { resolveInstalledIdentifierNameOrInput } from "@agentxm/client-core/unstable/source-resolution";
import { expandGlob } from "@agentxm/client-core/unstable/utils";
import { SkillManager } from "@agentxm/client-core/unstable/skills";
import {
  buildUninstallOperation,
  type UninstallRetentionPolicy,
} from "@agentxm/client-core/unstable/extensions";
import type { SkillExtensionTarget } from "@agentxm/client-core/unstable/workspace";
import type { UninstallExtensionCommandWorkflowActions } from "@agentxm/client-core/unstable/workflows";
import type { AppError } from "@agentxm/client-core/unstable/app-error";
import type { Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
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
>()("axm.sh/UninstallSkillCommandWorkflowActions") {}

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
    const ws = yield* WorkspaceMutations;
    const renderer = yield* CliRenderer;
    const skillMgr = yield* SkillManager;

    const parseArgs = (
      args: UninstallHandlerArgs,
    ): Effect.Effect<ParsedSkillUninstallArgs, AppError> =>
      Effect.gen(function* () {
        yield* renderer.info("axm skills uninstall");

        // Load installed skills for glob expansion
        const installedSkills = yield* ws.records.getInstalledSkills();
        const installedNames = Object.keys(installedSkills);

        // Expand glob pattern against installed skill names (excludes ignored)
        const skillNames = expandGlob(args.skill, installedNames);

        // Handle glob matching zero skills
        if (args.skill.includes("*") && skillNames.length === 0) {
          yield* renderer.warn(`No skills matched pattern "${args.skill}"`);
          yield* renderer.success("Nothing to uninstall.");
          return { skills: [] } satisfies ParsedSkillUninstallArgs;
        }

        const names =
          skillNames.length > 0
            ? skillNames
            : [
                yield* resolveInstalledIdentifierNameOrInput({
                  input: args.skill,
                  resourceType: "skill",
                }).pipe(Effect.provideService(WorkspaceMutations, ws)),
              ];

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
      Effect.succeed(
        (() => {
          const retentionPolicy: UninstallRetentionPolicy = {
            isRequiredByInstalledPack: (policyArgs) =>
              ws.isExtensionRequiredByInstalledExtensionPack(policyArgs.target),
            markDependencyRetainedInLockfile: (policyArgs) =>
              ws.markDependencyRetainedInLockfile(policyArgs.target),
          };

          const steps: PlannedJobStep[] = intent.skillsToUninstall.map((entry) => {
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
        })(),
      );

    return {
      parseArgs,
      finalizeIntent,
      buildUninstallPlan,
    };
  }),
);
