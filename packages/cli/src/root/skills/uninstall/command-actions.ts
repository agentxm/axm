/**
 * Skill uninstall command workflow actions.
 *
 * Implements `UninstallExtensionCommandWorkflowActions` for the skill uninstall
 * command. The live layer captures all required services at construction time
 * so action methods satisfy the `R = never` contract.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { count } from "@agentxm/extension-management/unstable/cli-renderer";
import {
  WorkspaceMutations,
  installedRowsByName,
  acquiredExtensionDisplayPathFromLockEntry,
  sanitizeName,
  type SkillExtensionTarget,
} from "@agentxm/extension-management/unstable/workspace";
import { resolveInstalledIdentifierNameOrInput } from "@agentxm/extension-management/unstable/source-resolution";
import { expandGlob } from "@agentxm/extension-management/unstable/utils";
import { CodingAgentRepository } from "@agentxm/extension-management/unstable/agents";
import {
  SkillManager,
  skillArtifactFromTargets,
  type InstallableSkillTarget,
} from "@agentxm/extension-management/unstable/skills";
import { buildUninstallOperation } from "@agentxm/extension-management/unstable/extensions";
import type { SkillLockEntry } from "@agentxm/extension-management/unstable/lockfile";
import type { UninstallExtensionCommandWorkflowActions } from "@agentxm/extension-management/unstable/workflows";
import {
  workspaceAuthoredPath,
  workspaceCanonicalPath,
  workspaceCanonicalRoot,
  workspaceLockfilePath,
  workspaceSettingsPath,
} from "../../shared/workspace-display-paths.js";
import type { AppError } from "@agentxm/extension-management/unstable/app-error";
import type {
  JobStepArtifactTarget,
  JobStepResult,
  Plan,
  PlannedJobStep,
} from "@agentxm/extension-management/unstable/plan";
import type { UninstallSkillCommandIntent } from "./intent.js";
import { makeWorkspaceRetentionPolicy } from "../../shared/workspace-retention-policy.js";
import { toAppError } from "@agentxm/extension-management/unstable/app-error/conversions";

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

type UninstallSkillActions = UninstallExtensionCommandWorkflowActions<
  UninstallHandlerArgs,
  ParsedSkillUninstallArgs,
  UninstallSkillCommandIntent
>;

const skillSourceTarget = (
  ws: typeof WorkspaceMutations.Service,
  path: Path.Path,
  configuredSource: Option.Option<string>,
  lockEntry: Option.Option<SkillLockEntry>,
  sanitizedName: string,
): JobStepArtifactTarget => {
  if (Option.isSome(configuredSource) && configuredSource.value === "workspace") {
    return {
      path: workspaceAuthoredPath(path, ws, "skill", sanitizedName),
      change: "unchanged",
    };
  }
  if (Option.isSome(lockEntry)) {
    const entry = lockEntry.value;
    return {
      path: acquiredExtensionDisplayPathFromLockEntry(
        workspaceCanonicalRoot(ws.scope),
        entry,
        "skills",
        entry.workspaceName,
      ),
      change: "removed",
    };
  }
  return {
    path: workspaceCanonicalPath(ws.scope, sanitizedName),
    change: "removed",
  };
};

export const UninstallSkillCommandWorkflowActions = Effect.gen(function* () {
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
      const installedSkills = yield* ws.records
        .rows("skill")
        .pipe(Effect.mapError(toAppError))
        .pipe(Effect.map(installedRowsByName));
      const installedNames = Object.keys(installedSkills);

      // Expand the glob pattern against installed skill names.
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

  const buildUninstallPlan = (intent: UninstallSkillCommandIntent): Effect.Effect<Plan, AppError> =>
    Effect.gen(function* () {
      const retentionPolicy = makeWorkspaceRetentionPolicy(ws);
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

      const steps = yield* Effect.forEach(
        intent.skillsToUninstall,
        (entry): Effect.Effect<PlannedJobStep, AppError> =>
          Effect.gen(function* () {
            const target: SkillExtensionTarget = {
              type: "skill" as const,
              name: entry.skillName,
            };
            const step = buildUninstallOperation(skillMgr, retentionPolicy, { target });
            if (step.readiness !== "ready") return step;

            const sanitizedName = sanitizeName(entry.skillName);
            const configuredSource =
              skillMgr.getConfiguredSource === undefined
                ? Option.none<string>()
                : yield* skillMgr.getConfiguredSource({ target });
            const lockEntry = yield* ws
              .getLockedSkill(entry.skillName)
              .pipe(Effect.mapError(toAppError))
              .pipe(Effect.catch(() => Effect.succeed(Option.none())));
            const artifact = yield* skillArtifactFromTargets({
              targets: installableTargets,
              workspaceRoot: ws.baseDir,
              sanitizedName,
              scope: ws.scope,
              change: "removed",
              workspaceTargets: [
                { path: workspaceLockfilePath(ws.scope), change: "updated" },
                { path: workspaceSettingsPath(ws.scope), change: "updated" },
                skillSourceTarget(ws, path, configuredSource, lockEntry, sanitizedName),
              ],
            }).pipe(
              Effect.provideService(FileSystem.FileSystem, fs),
              Effect.provideService(Path.Path, path),
            );

            const run = Effect.gen(function* () {
              const result = yield* step.run;
              if (
                result.result === "error" ||
                result.disposition === "unchanged" ||
                result.message.includes("retained its package")
              ) {
                return result;
              }

              return {
                ...result,
                artifact,
              } satisfies JobStepResult;
            });

            return { ...step, artifact, run } satisfies PlannedJobStep;
          }).pipe(Effect.mapError(toAppError)),
        { concurrency: "unbounded" },
      );

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
    });

  return {
    parseArgs,
    finalizeIntent,
    buildUninstallPlan,
  };
}).pipe(Effect.map((actions): UninstallSkillActions => actions));
