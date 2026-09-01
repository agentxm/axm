/**
 * Disable skill executor — removes agent symlinks but preserves canonical files.
 *
 * Materialized artifacts are observed directly. Accepted-resolution rows identify
 * source content but do not prove that canonical or projected files exist.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Layer from "effect/Layer";
import { DefaultCodingAgentRepository } from "../../extension-workspace/index.js";
import { makeAppError } from "../../app-error/index.js";
import { failureToStepFailure } from "../../app-error/conversions.js";
import type { OperationHandler } from "../../plan/apply-plan.js";
import type { Operation } from "../../plan/plan.js";
import type { JobStepResult } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { sanitizeName } from "../../workspace/extension-name.js";
import { skillArtifactFromTargets, type InstallableSkillTarget } from "./install.js";
import { installedRowsByName } from "../../workspace/read-model-record-rows.js";
import { removeSkillAgentArtifact } from "../materialization.js";

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Disable a skill (remove files but keep settings/lockfile entry).
 *
 * @experimental This API is unstable and may change without notice.
 */
export type DisableSkillOperation = Operation<"disable-skill", { readonly skillName: string }>;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Disable-skill operation handler.
 *
 * Determines lifecycle from the workspace read model, removes observable
 * materialized targets, and promotes implicit pack members to a direct disabled
 * preference. Canonical files are preserved for later re-enablement.
 */
export const disableSkill: OperationHandler<
  DisableSkillOperation,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    const base = ws.baseDir;
    const fsPathLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
    );

    // Read lifecycle to determine promotion needs
    const installedSkills = yield* ws.records.rows("skill").pipe(Effect.map(installedRowsByName));
    const installed = installedSkills[op.args.skillName];
    const isImplicit = installed !== undefined && installed.lifecycle === "implicit";
    const graph = yield* ws.getDesiredStateGraph();
    if (!graph.complete) {
      return yield* makeAppError({
        code: "conflict",
        detail: "Cannot disable the skill while pack-derived desired state is unresolved.",
      });
    }
    const desiredBeforeDisable = graph.nodes.find(
      (node) => node.type === "skill" && node.name === op.args.skillName,
    );

    const sanitizedName = sanitizeName(op.args.skillName);
    const materializationAgents =
      yield* DefaultCodingAgentRepository.getMaterializationAgents().pipe(
        Effect.provideService(WorkspaceMutations, ws),
      );
    const installableTargetOptions = yield* ws.runTransaction({
      transition: Effect.gen(function* () {
        if (isImplicit) {
          const source =
            desiredBeforeDisable?.source ?? Option.getOrElse(installed.source, () => undefined);
          if (source === undefined) {
            return yield* makeAppError({
              code: "internal",
              detail: `Cannot determine source for implicit skill "${op.args.skillName}"`,
              suggestions: [{ description: "Provide a source when disabling this skill" }],
            });
          }
          yield* ws.setSkillEntry(op.args.skillName, { source, enabled: false });
        } else {
          yield* ws.updateSkillEntry(op.args.skillName, (entry) => ({
            ...entry,
            enabled: false,
          }));
        }

        return yield* Effect.forEach(
          materializationAgents,
          (agent) =>
            agent.resolveEffectiveSkillsDir({ workspaceRoot: base }).pipe(
              Effect.provide(fsPathLayer),
              Effect.flatMap((outcome) =>
                outcome._tag === "supported"
                  ? Effect.gen(function* () {
                      const targetDir = path.normalize(outcome.dir);
                      yield* removeSkillAgentArtifact({
                        fs,
                        pathService: path,
                        targetDir,
                        sanitizedName,
                      });
                      return Option.some({
                        agentId: agent.id,
                        targetDir,
                      } satisfies InstallableSkillTarget);
                    })
                  : Effect.succeed(Option.none<InstallableSkillTarget>()),
              ),
            ),
          { concurrency: "unbounded" },
        );
      }).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
      ),
      validate: () => Effect.void,
    });
    const installableTargets = Array.getSomes(installableTargetOptions);

    const artifact = yield* skillArtifactFromTargets({
      targets: installableTargets,
      workspaceRoot: base,
      sanitizedName,
      scope: ws.scope,
      change: "removed",
      workspaceTargets: [
        {
          path: ws.scope === "project" ? "axm.json" : ".axm/workspace/axm.json",
          change: "updated",
        },
      ],
    }).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    );

    return {
      result: "success",
      message: `Disabled ${op.args.skillName}`,
      artifact,
    } satisfies JobStepResult;
  }).pipe(Effect.mapError(failureToStepFailure));
