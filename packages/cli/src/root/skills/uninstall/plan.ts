/**
 * Uninstall-specific plan builder.
 *
 * Diffs uninstall operations against installed state to produce a Plan with
 * inline run closures. Installed skills become ready steps; missing skills
 * become no-op success steps. Pack-referenced skills become error steps.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { Record as EffectRecord } from "effect";
import type { Plan, PlannedJobStep, JobStepResult } from "@agentxm/client-core/unstable/plan";
import { Workspace } from "@agentxm/client-core/unstable/workspace";
import { uninstallSkill } from "@agentxm/client-core/unstable/skills";
import type { UninstallSkillOperation } from "@agentxm/client-core/unstable/skills";

/** Keyed by skill name. Presence = installed. */
export type InstalledSkills = EffectRecord.ReadonlyRecord<
  string,
  { readonly referencingPacks: ReadonlyArray<string> }
>;

/**
 * Build a plan by comparing operations against installed state.
 * Captures workspace services for run closures.
 */
export const buildSkillUninstallPlan = (
  ops: ReadonlyArray<UninstallSkillOperation>,
  installed: InstalledSkills,
  name: string,
  description: Option.Option<string>,
) =>
  Effect.gen(function* () {
    const workspace = yield* Workspace;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const steps: PlannedJobStep[] = ops.map((op) => {
      const entry = installed[op.args.skillName];

      if (entry === undefined) {
        return {
          readiness: "ready",
          label: op.args.skillName,
          run: Effect.succeed<JobStepResult>({
            result: "success",
            message: `${op.args.skillName} not installed`,
          }),
        } satisfies PlannedJobStep;
      }

      if (entry.referencingPacks.length > 0) {
        const packs = entry.referencingPacks.join(", ");
        return {
          readiness: "error",
          errorMessage: `required by pack ${packs}. Use 'axm skills disable <skill>' instead`,
          label: op.args.skillName,
        } satisfies PlannedJobStep;
      }

      // Capture services in run closure
      const runEffect = uninstallSkill(op).pipe(
        Effect.map(
          (result): JobStepResult =>
            result.result === "error"
              ? { result: "error", message: result.message, error: result.error }
              : { result: "success", message: result.message },
        ),
        Effect.provideService(Workspace, workspace),
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
      );

      return {
        readiness: "ready",
        label: op.args.skillName,
        run: runEffect,
      } satisfies PlannedJobStep;
    });

    return {
      _tag: "Plan",
      name,
      description,
      jobs: [
        {
          concurrency: 1 as const,
          steps,
        },
      ],
    } satisfies Plan;
  });
