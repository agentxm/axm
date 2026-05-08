/**
 * Skills-specific plan builder.
 *
 * Builds install operations from selected skill refs and diffs them against
 * current lockfile state to produce a Plan with inline run closures.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { Plan, PlannedJobStep, JobStepResult } from "@agentxm/client-core/unstable/plan";
import type { VersionConstraint } from "@agentxm/client-core/unstable/version-constraints";
import type { SkillExtensionRef } from "@agentxm/client-core/unstable/skills";
import type { Source } from "@agentxm/client-core/unstable/sources";
import { SourceHostProviders } from "@agentxm/client-core/unstable/source-resolution";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { CodingAgentRepository } from "@agentxm/client-core/unstable/agents";
import { installSkill } from "@agentxm/client-core/unstable/skills";
import type { InstallSkillOperation } from "@agentxm/client-core/unstable/skills";

/**
 * Args for building an install plan.
 */
export interface BuildSkillInstallPlanArgs {
  readonly selectedSkills: ReadonlyArray<SkillExtensionRef>;
  readonly source: Source;
  readonly force: boolean;
  readonly versionConstraint: Option.Option<VersionConstraint>;
}

/**
 * Build a plan by computing install operations and comparing against lockfile state.
 * Captures all service dependencies into step run closures.
 */
export const buildSkillInstallPlan = ({
  selectedSkills,
  source,
  force,
  versionConstraint,
}: BuildSkillInstallPlanArgs) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceMutations;
    const sources = yield* SourceHostProviders;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const renderer = yield* CliRenderer;
    const agentRepo = yield* CodingAgentRepository;
    const lockedSkills = yield* workspace.getLockedSkills().pipe(
      Effect.catch((error) => {
        if (error.code === "validation") {
          return Effect.succeed({});
        }

        return Effect.fail(error);
      }),
    );

    const steps: PlannedJobStep[] = selectedSkills.map((ref) => {
      const installed = Object.hasOwn(lockedSkills, ref.skill.name);

      const op: InstallSkillOperation = {
        name: "install-skill",
        args: {
          ref,
          force,
          versionConstraint: ref.refType === "registry" ? versionConstraint : Option.none(),
          skipSettings: Option.none(),
          strictUnknownAgents: Option.none(),
          existingInstalledAt: Option.none(),
          sourceName: Option.none(),
        },
      };

      if (installed && !force) {
        return {
          readiness: "ready",
          label: ref.skill.name,
          run: Effect.succeed<JobStepResult>({
            result: "success",
            message: `${ref.skill.name} already installed`,
          }),
        } satisfies PlannedJobStep;
      }

      // Capture services and provide them to the run closure
      const runEffect = installSkill(op).pipe(
        Effect.map(
          (result): JobStepResult =>
            result.result === "error"
              ? { result: "error", message: result.message, error: result.error }
              : { result: "success", message: result.message },
        ),
        Effect.provideService(WorkspaceMutations, workspace),
        Effect.provideService(SourceHostProviders, sources),
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
        Effect.provideService(CliRenderer, renderer),
        Effect.provideService(CodingAgentRepository, agentRepo),
      );

      return {
        readiness: "ready",
        label: ref.skill.name,
        run: runEffect,
      } satisfies PlannedJobStep;
    });

    return {
      _tag: "Plan",
      name: "Install skill(s)",
      description: Option.some(`Install skills from ${sources.origin(source)}`),
      jobs: [
        {
          concurrency: 1 as const,
          steps,
        },
      ],
    } satisfies Plan;
  });
