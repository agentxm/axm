/**
 * Enable skill executor — re-creates agent symlinks for a previously disabled skill.
 *
 * Enabling requires desired canonical content aligned with its accepted
 * external resolution when one is required.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Layer from "effect/Layer";
import { DefaultCodingAgentRepository } from "@agentxm/extension-workspace";
import type { AgentId } from "@agentxm/extension-model/unstable/agents/types";
import { ExtensionLifecycleFailed } from "../../errors.js";
import { LifecycleFailureAdapter, withAdaptedStepFailures } from "../../failure-adapter.js";
import type { OperationHandler } from "@agentxm/workspace-operations";
import type { Operation } from "@agentxm/workspace-operations";
import type { JobStepResult } from "@agentxm/workspace-operations";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import { sanitizeName } from "@agentxm/workspace-state";
import { ensureSkillAgentArtifact } from "../materialization.js";
import {
  skillArtifactFromTargets,
  type InstallableSkillTarget,
} from "@agentxm/extension-workspace";
import { usableAcceptedCanonicalObservation } from "@agentxm/workspace-state";

// Operation types
// -----------------------------------------------------------------------------

/**
 * Enable a previously disabled skill (re-install files and update state).
 *
 * @experimental This API is unstable and may change without notice.
 */
export type EnableSkillOperation = Operation<"enable-skill", { readonly skillName: string }>;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Enable-skill operation handler.
 *
 * 1. Resolve usable canonical content from desired state, accepted resolution, and observation.
 * 2. Create agent artifacts.
 * 3. Update settings to set enabled: true.
 */
export const enableSkill: OperationHandler<
  EnableSkillOperation,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations | LifecycleFailureAdapter
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
    const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.provide(effect, fsPathLayer);

    const canonical = yield* usableAcceptedCanonicalObservation({
      workspace: ws,
      type: "skill",
      name: op.args.skillName,
    });
    if (Option.isNone(canonical)) {
      return yield* new ExtensionLifecycleFailed({
        category: "not_found",
        detail: `Accepted skill content for "${op.args.skillName}" is not usable`,
        suggestions: [
          {
            description: "Try reinstalling the skill.",
            cmd: "axm skills install <source>",
          },
        ],
      });
    }

    const sanitizedName = sanitizeName(op.args.skillName);
    const materializationAgents =
      yield* DefaultCodingAgentRepository.getMaterializationAgents().pipe(
        Effect.provideService(WorkspaceMutations, ws),
      );

    const skillSrcPath = canonical.value.observation.path;

    const installableTargets = yield* ws.runTransaction({
      transition: Effect.gen(function* () {
        const resolvedTargets = yield* Effect.forEach(
          materializationAgents,
          (agent) =>
            agent.resolveEffectiveSkillsDir({ workspaceRoot: base }).pipe(
              Effect.provide(fsPathLayer),
              Effect.map((outcome) => ({ agent, outcome })),
            ),
          { concurrency: "unbounded" },
        );
        const targets: ReadonlyArray<InstallableSkillTarget> = resolvedTargets.flatMap(
          ({ agent, outcome }) =>
            outcome._tag === "supported"
              ? [{ agentId: agent.id, targetDir: path.normalize(outcome.dir) }]
              : [],
        );
        const locations = new Map<
          string,
          { readonly targetDir: string; readonly agentIds: AgentId[] }
        >();
        for (const target of targets) {
          const current = locations.get(target.targetDir);
          if (current === undefined) {
            locations.set(target.targetDir, {
              targetDir: target.targetDir,
              agentIds: [target.agentId],
            });
          } else if (!current.agentIds.includes(target.agentId)) {
            current.agentIds.push(target.agentId);
          }
        }
        yield* Effect.forEach(
          [...locations.values()],
          (location) =>
            ensureSkillAgentArtifact({
              canonicalSkillSrcPath: skillSrcPath,
              targetDir: location.targetDir,
              sanitizedName,
              pathService: path,
              baseDir: base,
              provide,
            }),
          { concurrency: "unbounded" },
        );
        yield* ws.updateSkillEntry(op.args.skillName, (entry) => ({
          ...entry,
          enabled: true,
        }));
        return targets;
      }).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
      ),
      validate: () => Effect.void,
    });
    const artifact = yield* skillArtifactFromTargets({
      targets: installableTargets,
      workspaceRoot: base,
      sanitizedName,
      scope: ws.scope,
      change: "created",
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
      message: `Enabled ${op.args.skillName}`,
      artifact,
    } satisfies JobStepResult;
  }).pipe(withAdaptedStepFailures);
