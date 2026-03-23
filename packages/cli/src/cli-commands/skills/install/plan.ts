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
import type { Plan, PlannedJobStep, JobStepResult } from "../../../workspace/plan.js";
import { CliEnvConfig } from "../../../config/index.js";
import {
  SourceHostProviders,
  type SkillExtensionRef,
  type Source,
} from "../../../sources/index.js";
import { Workspace } from "../../../workspace/index.js";
import { Log } from "../../../clack-effect/index.js";
import { installSkill } from "../../../extensions/skills/operations/install.js";
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
 * Captures all service dependencies into step run closures.
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
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const log = yield* Log;
    const envConfig = yield* CliEnvConfig;
    const lockedSkills = yield* workspace.getLockedSkills().pipe(
      Effect.catch((error) => {
        if (
          error.code === "LOCKFILE_PARSE_FAILED" ||
          error.code === "LOCKFILE_RESOLVED_VERSION_INVALID"
        ) {
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
        Effect.provideService(Workspace, workspace),
        Effect.provideService(SourceHostProviders, sources),
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
        Effect.provideService(Log, log),
        Effect.provideService(CliEnvConfig, envConfig),
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
