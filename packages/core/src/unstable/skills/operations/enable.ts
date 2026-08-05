/**
 * Enable skill executor — re-creates agent symlinks for a previously disabled skill.
 *
 * Enabling requires usable trusted canonical content. Receipts are not consulted:
 * they are optional post-success history, not an input to lifecycle decisions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Layer from "effect/Layer";
import { DefaultCodingAgentRepository } from "../../agents/index.js";
import type { AgentId } from "../../agents/index.js";
import { makeAppError } from "../../app-error/index.js";
import type { OperationHandler } from "../../plan/apply-plan.js";
import type { Operation } from "../../plan/plan.js";
import type { JobStepResult } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { sanitizeName } from "../../extensions/utils.js";
import { ensureSkillAgentArtifact } from "../materialization.js";
import {
  renderTargetAgentIdForLocation,
  skillArtifactFromTargets,
  type InstallableSkillTarget,
} from "./install.js";
import {
  capabilityRenderTargetForAgentId,
  materializeCapabilityTargetedBuild,
} from "../../capability-targeting/index.js";
import { usableTrustedCanonicalObservation } from "../../workspace/trusted-canonical-ref.js";

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
 * 1. Resolve usable canonical content from desired state, trust, and observation.
 * 2. Create agent artifacts.
 * 3. Update settings to set enabled: true.
 */
export const enableSkill: OperationHandler<
  EnableSkillOperation,
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
    const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.provide(effect, fsPathLayer);

    const canonical = yield* usableTrustedCanonicalObservation({
      workspace: ws,
      type: "skill",
      name: op.args.skillName,
    });
    if (Option.isNone(canonical)) {
      return yield* makeAppError({
        code: "not_found",
        detail: `Trusted skill content for "${op.args.skillName}" is not usable`,
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

    const resolvedTargets = yield* Effect.forEach(
      materializationAgents,
      (agent) =>
        agent.resolveEffectiveSkillsDir({ workspaceRoot: base }).pipe(
          Effect.provide(fsPathLayer),
          Effect.map((outcome) => ({ agent, outcome })),
        ),
      { concurrency: "unbounded" },
    );
    const installableTargets: ReadonlyArray<InstallableSkillTarget> = resolvedTargets.flatMap(
      ({ agent, outcome }) =>
        outcome._tag === "supported"
          ? [{ agentId: agent.id, targetDir: path.normalize(outcome.dir) }]
          : [],
    );
    const locations = new Map<
      string,
      { readonly targetDir: string; readonly agentIds: AgentId[] }
    >();
    for (const target of installableTargets) {
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
    const builds = yield* Effect.forEach(
      [...locations.values()],
      (location) =>
        Effect.gen(function* () {
          const targetAgentId = renderTargetAgentIdForLocation(location.agentIds);
          const build = yield* materializeCapabilityTargetedBuild({
            baseDir: base,
            canonicalSourcePath: skillSrcPath,
            extensionName: sanitizedName,
            target: capabilityRenderTargetForAgentId(targetAgentId),
          }).pipe(
            Effect.mapError((cause) =>
              makeAppError({
                code: "internal",
                detail: `Failed to render ${op.args.skillName} for ${targetAgentId}`,
                cause,
              }),
            ),
          );
          yield* ensureSkillAgentArtifact({
            canonicalSkillSrcPath: build.artifactSourcePath,
            targetDir: location.targetDir,
            sanitizedName,
            pathService: path,
            baseDir: base,
            provide,
          });
          return { targetAgentId, build };
        }),
      { concurrency: "unbounded" },
    );
    for (const { targetAgentId, build } of builds) {
      for (const finding of build.findings) {
        yield* Effect.logWarning(
          `[${finding.code}] ${op.args.skillName} (${targetAgentId}): ${finding.message}`,
        );
      }
    }

    yield* ws
      .updateSkillEntry(op.args.skillName, (e) => ({ ...e, enabled: true }))
      .pipe(Effect.catch(() => Effect.void));

    const artifact = yield* skillArtifactFromTargets({
      targets: installableTargets,
      workspaceRoot: base,
      sanitizedName,
      scope: ws.scope,
      change: "created",
      workspaceTargets: [{ path: ".axm/settings.json", change: "updated" }],
    }).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    );

    return {
      result: "success",
      message: `Enabled ${op.args.skillName}`,
      artifact,
    } satisfies JobStepResult;
  });
