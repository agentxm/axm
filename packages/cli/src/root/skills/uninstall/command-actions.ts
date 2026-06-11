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
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { count } from "@agentxm/client-core/unstable/cli-renderer";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { resolveInstalledIdentifierNameOrInput } from "@agentxm/client-core/unstable/source-resolution";
import { expandGlob } from "@agentxm/client-core/unstable/utils";
import { CodingAgentRepository } from "@agentxm/client-core/unstable/agents";
import {
  SkillManager,
  skillArtifactFromTargets,
  type InstallableSkillTarget,
} from "@agentxm/client-core/unstable/skills";
import {
  EXTERNAL_EXTENSIONS_DIR,
  REGISTRY_EXTENSIONS_DIR,
  buildUninstallOperation,
  sanitizeName,
} from "@agentxm/client-core/unstable/extensions";
import type { SkillLockEntry } from "@agentxm/client-core/unstable/lockfile";
import type { SkillExtensionTarget } from "@agentxm/client-core/unstable/workspace";
import type { UninstallExtensionCommandWorkflowActions } from "@agentxm/client-core/unstable/workflows";
import type { AppError } from "@agentxm/client-core/unstable/app-error";
import type {
  JobStepArtifactTarget,
  JobStepResult,
  Plan,
  PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import type { UninstallSkillCommandIntent } from "./intent.js";
import { makeWorkspaceRetentionPolicy } from "../../shared/workspace-retention-policy.js";

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
>()("axm.sh/root/skills/uninstall/command-actions/UninstallSkillCommandWorkflowActions") {}

const skillSourceTarget = (
  lockEntry: Option.Option<SkillLockEntry>,
  sanitizedName: string,
): JobStepArtifactTarget => {
  if (Option.isSome(lockEntry) && lockEntry.value.type === "registry") {
    return {
      path: `${REGISTRY_EXTENSIONS_DIR}/${lockEntry.value.owner}/skills/${lockEntry.value.name}`,
      change: "removed",
    };
  }
  return {
    path: `${EXTERNAL_EXTENSIONS_DIR}/skills/${sanitizedName}`,
    change: "removed",
  };
};

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
    const skillMgr = yield* SkillManager;
    const agentRepo = yield* CodingAgentRepository;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const parseArgs = (
      args: UninstallHandlerArgs,
    ): Effect.Effect<ParsedSkillUninstallArgs, AppError> =>
      Effect.gen(function* () {
        // Load installed skills for glob expansion
        const installedSkills = yield* ws.records.getInstalledSkills();
        const installedNames = Object.keys(installedSkills);

        // Expand glob pattern against installed skill names (excludes ignored)
        const skillNames = expandGlob(args.skill, installedNames);

        // Handle glob matching zero skills
        if (args.skill.includes("*") && skillNames.length === 0) {
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
          const retentionPolicy = makeWorkspaceRetentionPolicy(ws);

          const steps: PlannedJobStep[] = intent.skillsToUninstall.map((entry) => {
            const target: SkillExtensionTarget = {
              type: "skill" as const,
              name: entry.skillName,
            };
            const step = buildUninstallOperation(skillMgr, retentionPolicy, { target });
            if (step.readiness !== "ready") return step;

            const run = Effect.gen(function* () {
              const configuredAgents = yield* agentRepo
                .getMaterializationAgents()
                .pipe(Effect.provideService(WorkspaceMutations, ws));
              const resolvedAgents = yield* Effect.forEach(
                configuredAgents,
                (agent) =>
                  agent.resolveEffectiveSkillsDir({ workspaceRoot: ws.baseDir }).pipe(
                    Effect.provideService(FileSystem.FileSystem, fs),
                    Effect.provideService(Path.Path, path),
                    Effect.map((outcome) => ({ agentId: agent.id, outcome })),
                  ),
                { concurrency: "unbounded" },
              );
              const installableTargets: Array<InstallableSkillTarget> = [];
              for (const { agentId, outcome } of resolvedAgents) {
                if (outcome._tag === "supported") {
                  installableTargets.push({
                    agentId,
                    targetDir: path.normalize(outcome.dir),
                  });
                }
              }

              const sanitizedName = sanitizeName(entry.skillName);
              const lockEntry = yield* ws.getLockedSkill(entry.skillName);
              const artifact = yield* skillArtifactFromTargets({
                targets: installableTargets,
                workspaceRoot: ws.baseDir,
                sanitizedName,
                scope: ws.scope,
                change: "removed",
                workspaceTargets: [
                  { path: ".axm/axm-lock.yaml", change: "updated" },
                  { path: ".axm/settings.json", change: "updated" },
                  skillSourceTarget(lockEntry, sanitizedName),
                ],
              }).pipe(
                Effect.provideService(FileSystem.FileSystem, fs),
                Effect.provideService(Path.Path, path),
              );

              const result = yield* step.run;
              if (
                result.result === "error" ||
                result.message === "not installed" ||
                result.message.includes("Kept on disk")
              ) {
                return result;
              }

              return {
                ...result,
                artifact,
              } satisfies JobStepResult;
            });

            return { ...step, run } satisfies PlannedJobStep;
          });

          return {
            _tag: "Plan",
            name:
              intent.skillsToUninstall.length === 0
                ? "Uninstall skills"
                : intent.skillsToUninstall.length === 1
                  ? "Uninstall skill"
                  : `Uninstall ${count(intent.skillsToUninstall.length, "skill")}`,
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
