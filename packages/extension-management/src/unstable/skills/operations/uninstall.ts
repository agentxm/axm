/**
 * Uninstall skill executor — orchestrates per-skill removal pipeline.
 *
 * Pipeline: resolve desired/observed state -> remove agent artifacts
 * concurrently -> remove canonical source -> clear settings and accepted resolution.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Layer from "effect/Layer";
import { DefaultCodingAgentRepository } from "@agentxm/extension-workspace";
import { AGENTS } from "@agentxm/extension-model/unstable/agents/registry";
import type { AgentId } from "@agentxm/extension-model/unstable/agents/types";
import { makeAppError } from "../../app-error/index.js";
import { failureToStepFailure } from "../../app-error/conversions.js";
import type { OperationHandler } from "@agentxm/workspace-operations";
import type { Operation } from "@agentxm/workspace-operations";
import type { JobStepResult } from "@agentxm/workspace-operations";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import { removeIfExists } from "@agentxm/workspace-state";
import { sanitizeName } from "@agentxm/workspace-state";
import {
  acceptedCanonicalObservation,
  acceptedLockedCanonicalPath,
  removableAcceptedCanonicalPath,
} from "@agentxm/workspace-state";

// Operation types
// -----------------------------------------------------------------------------

const isKnownAgentId = (id: string): id is AgentId => Object.hasOwn(AGENTS, id);

/**
 * Args for the uninstall-skill operation.
 */
export interface UninstallSkillOperationArgs {
  readonly skillName: string;
  /** Agent filter for partial uninstall. Empty = all agents. */
  readonly agents: ReadonlyArray<string>;
}

/**
 * Remove a skill from the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type UninstallSkillOperation = Operation<"uninstall-skill", UninstallSkillOperationArgs>;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Uninstall-skill operation handler.
 *
 * Reads workspace paths from the WorkspaceMutations service, then orchestrates:
 * 1. Sanitize skill name for filesystem
 * 2. Resolve configured and observed state
 * 3. Remove agent symlinks concurrently (skip missing)
 * 4. Remove from all known canonical locations (full uninstall only)
 * 5. Remove or update settings and accepted resolution
 */
export const uninstallSkill: OperationHandler<
  UninstallSkillOperation,
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

    const sanitizedName = sanitizeName(op.args.skillName);

    const desired = yield* ws.getDesiredStateGraph();
    if (!desired.complete) {
      return yield* makeAppError({
        code: "conflict",
        detail: "Cannot uninstall the skill while the desired extension graph is incomplete.",
        recover: "Repair or reinstall the configured packs, then retry.",
      });
    }
    const desiredNode = desired.nodes.find(
      (node) => node.type === "skill" && node.name === op.args.skillName,
    );
    const acceptedCanonical = yield* acceptedCanonicalObservation({
      workspace: ws,
      type: "skill",
      name: op.args.skillName,
    });
    const lockedCanonical = yield* acceptedLockedCanonicalPath({
      workspace: ws,
      type: "skill",
      name: op.args.skillName,
    });
    const removableCanonical = Option.orElse(
      removableAcceptedCanonicalPath(acceptedCanonical),
      () => lockedCanonical,
    );
    const installedOnDisk = yield* Option.match(removableCanonical, {
      onNone: () => Effect.succeed(false),
      onSome: (canonicalPath) =>
        fs.exists(canonicalPath).pipe(Effect.catch(() => Effect.succeed(false))),
    });

    if (desiredNode === undefined && !installedOnDisk) {
      return { result: "success", message: "not installed" } satisfies JobStepResult;
    }

    // Determine which configured agent artifacts to remove. Per-agent state is
    // derived from settings and disk rather than persisted in the lockfile.
    const agentFilter = op.args.agents;
    const isPartialUninstall = agentFilter.length > 0;
    const materializationAgents =
      yield* DefaultCodingAgentRepository.getMaterializationAgents().pipe(
        Effect.provideService(WorkspaceMutations, ws),
      );
    const agentsToRemove = isPartialUninstall
      ? agentFilter
      : materializationAgents.map((agent) => agent.id);
    const remainingAgents = materializationAgents
      .map((agent) => agent.id)
      .filter((agent) => !agentsToRemove.includes(agent));
    const agentsById: ReadonlyMap<string, (typeof materializationAgents)[number]> = new Map(
      materializationAgents.map((agent) => [agent.id, agent]),
    );

    const resolveAgentArtifactPath = (agentId: string) => {
      const configuredAgent = agentsById.get(agentId);
      const agentEffect =
        configuredAgent !== undefined
          ? Effect.succeed(Option.some(configuredAgent))
          : isKnownAgentId(agentId)
            ? DefaultCodingAgentRepository.get(agentId).pipe(Effect.map(Option.some))
            : Effect.succeed(Option.none());

      return agentEffect.pipe(
        Effect.flatMap((agentOption) => {
          if (Option.isNone(agentOption)) return Effect.succeed(Option.none<string>());
          return agentOption.value
            .resolveEffectiveSkillsDir({ workspaceRoot: base })
            .pipe(
              Effect.map((outcome) =>
                outcome._tag === "supported"
                  ? Option.some(path.normalize(path.join(outcome.dir, sanitizedName)))
                  : Option.none<string>(),
              ),
            );
        }),
        Effect.provide(fsPathLayer),
      );
    };

    const retainedArtifactOptions = yield* Effect.forEach(
      remainingAgents,
      resolveAgentArtifactPath,
      { concurrency: "unbounded" },
    );
    const retainedArtifactPaths = new Set(
      retainedArtifactOptions.flatMap((artifactPath) =>
        Option.isSome(artifactPath) ? [artifactPath.value] : [],
      ),
    );

    // Remove agent symlinks/copies concurrently using adapter-derived paths.
    yield* Effect.forEach(
      agentsToRemove,
      (agentId) => {
        const configuredAgent = agentsById.get(agentId);
        const agentEffect =
          configuredAgent !== undefined
            ? Effect.succeed(Option.some(configuredAgent))
            : isKnownAgentId(agentId)
              ? DefaultCodingAgentRepository.get(agentId).pipe(Effect.map(Option.some))
              : Effect.succeed(Option.none());

        return agentEffect.pipe(
          Effect.flatMap((agentOption) => {
            if (Option.isNone(agentOption)) {
              return Effect.succeed({
                _tag: "unsupported",
                reason: `Unknown coding agent: ${agentId}`,
              } as const);
            }
            return agentOption.value.resolveEffectiveSkillsDir({ workspaceRoot: base });
          }),
          Effect.provide(fsPathLayer),
          Effect.flatMap((outcome) =>
            outcome._tag === "supported"
              ? (() => {
                  const artifactPath = path.normalize(path.join(outcome.dir, sanitizedName));
                  return retainedArtifactPaths.has(artifactPath)
                    ? Effect.void
                    : fs
                        .remove(artifactPath, { recursive: true })
                        .pipe(Effect.catch(() => Effect.void));
                })()
              : Effect.void,
          ),
        );
      },
      { concurrency: "unbounded" },
    );

    // Handle partial vs full uninstall
    if (isPartialUninstall) {
      const agentList = [...agentsToRemove].join(", ");
      return {
        result: "success",
        message: `Uninstalled ${op.args.skillName} from ${agentList}`,
      } satisfies JobStepResult;
    }

    const packOwned = desiredNode?.origins.some((origin) => origin.type === "pack") ?? false;

    if (packOwned) {
      // Pack still references this skill — remove from settings only, keep lockfile + disk
      yield* ws.removeSkillFromSettings(op.args.skillName).pipe(Effect.catch(() => Effect.void));

      return {
        result: "success",
        message: `Uninstalled ${op.args.skillName}`,
      } satisfies JobStepResult;
    }

    // Full uninstall removes only the canonical package proven by accepted authority.
    if (Option.isSome(removableCanonical)) yield* removeIfExists(fs, removableCanonical.value);

    // Remove from both settings and lockfile (swallow errors on full uninstall)
    yield* ws.removeSkill(op.args.skillName).pipe(Effect.catch(() => Effect.void));

    return {
      result: "success",
      message: `Uninstalled ${op.args.skillName}`,
    } satisfies JobStepResult;
  }).pipe(Effect.mapError(failureToStepFailure));
