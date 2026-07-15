/**
 * Enable skill executor — re-creates agent symlinks for a previously disabled skill.
 *
 * Two paths:
 * - Lock entry present: full enable (symlinks + lock agents + settings)
 * - No lock entry: settings-only toggle (configured skill with no lock backing)
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
import type { CapabilityRenderInput } from "../../lockfile/index.js";

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
 * Lock-backed path:
 * 1. Read configured agents, lock entry
 * 2. Compute canonical path via getSkillDir (uses lockfile)
 * 3. Verify canonical directory exists
 * 4. Create agent symlinks (concurrent)
 * 5. Update lock agents
 * 6. Update settings entry to set enabled: true
 *
 * Settings-only path (no lock entry):
 * 1. Update settings entry to set enabled: true
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

    // Check for lock entry to determine path
    const lockEntry = yield* ws.getLockedSkill(op.args.skillName);

    // Settings-only path: no lock entry, just toggle enabled flag
    if (Option.isNone(lockEntry)) {
      yield* ws
        .updateSkillEntry(op.args.skillName, (e) => ({ ...e, enabled: true }))
        .pipe(Effect.catch(() => Effect.void));

      return {
        result: "success",
        message: `Enabled ${op.args.skillName}`,
      } satisfies JobStepResult;
    }

    // Lock-backed path: full enable with symlinks
    const sanitizedName = sanitizeName(op.args.skillName);
    const materializationAgents =
      yield* DefaultCodingAgentRepository.getMaterializationAgents().pipe(
        Effect.provideService(WorkspaceMutations, ws),
      );

    const { skillSrcPath } = yield* ws.getSkillDir(op.args.skillName);

    const exists = yield* fs.exists(skillSrcPath).pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) {
      return yield* makeAppError({
        code: "not_found",
        detail: `Skill files for "${op.args.skillName}" not found at ${skillSrcPath}`,
        suggestions: [
          {
            description: "Try reinstalling the skill.",
            cmd: "axm skills install <source>",
          },
        ],
      });
    }

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
    const renderInputs: Record<string, CapabilityRenderInput> = {};
    const degradedRenders: Record<string, ReadonlyArray<string>> = {};
    for (const { targetAgentId, build } of builds) {
      if (build.renderInput !== undefined) renderInputs[targetAgentId] = build.renderInput;
      if (build.degraded) {
        degradedRenders[targetAgentId] = [
          ...new Set(build.findings.map((finding) => finding.code)),
        ].sort();
      }
      for (const finding of build.findings) {
        yield* Effect.logWarning(
          `[${finding.code}] ${op.args.skillName} (${targetAgentId}): ${finding.message}`,
        );
      }
    }

    yield* ws
      .setSkillLock({
        name: op.args.skillName,
        lockEntry: {
          ...lockEntry.value,
          agents: materializationAgents.map((agent) => agent.id),
          ...(Object.keys(renderInputs).length === 0 ? {} : { renderInputs }),
          ...(Object.keys(degradedRenders).length === 0 ? {} : { degradedRenders }),
        },
        versionRange: Option.none(),
      })
      .pipe(Effect.catch(() => Effect.void));

    yield* ws
      .updateSkillEntry(op.args.skillName, (e) => ({ ...e, enabled: true }))
      .pipe(Effect.catch(() => Effect.void));

    const artifact = yield* skillArtifactFromTargets({
      targets: installableTargets,
      workspaceRoot: base,
      sanitizedName,
      scope: ws.scope,
      change: "created",
      workspaceTargets: [
        { path: ".axm/axm-lock.yaml", change: "updated" },
        { path: ".axm/settings.json", change: "updated" },
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
  });
