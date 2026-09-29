/**
 * Skill artifact and install-target semantics shared by the lifecycle and
 * sync features: physical directory grouping, shared Skill policy, and the
 * step-artifact shape describing where a skill materializes.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import { resolveNativeReferent, type NativeLocationError } from "../locations/index.js";
import * as Path from "effect/Path";
import type { MaterializationTargetId } from "@agentxm/extension-model/unstable/agents/types";
import { UNIVERSAL_SKILLS_DIR } from "@agentxm/extension-model/unstable/extensions/universal-skills-dir";
import type { JobStepArtifact, JobStepArtifactTarget } from "../operations/index.js";

export type InstallableSkillTarget = {
  readonly agentId: MaterializationTargetId;
  readonly targetDir: string;
};

export type InstallableSkillTargetLocation = {
  readonly targetDir: string;
  readonly agentIds: ReadonlyArray<MaterializationTargetId>;
};

export const artifactAgentIdsFromTargets = (
  targets: ReadonlyArray<InstallableSkillTarget>,
): ReadonlyArray<string> => Array.dedupe(targets.map((target) => target.agentId));

export const artifactTargetAgentIds = (
  agentIds: ReadonlyArray<MaterializationTargetId>,
): ReadonlyArray<string> => agentIds;

export const groupInstallTargetsByDirectory = (
  targets: ReadonlyArray<InstallableSkillTarget>,
  workspaceRoot: string,
): Effect.Effect<
  ReadonlyArray<InstallableSkillTargetLocation>,
  NativeLocationError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const sharedDir = yield* resolveNativeReferent(path.join(workspaceRoot, UNIVERSAL_SKILLS_DIR));
    const keyedTargets = yield* Effect.forEach(
      targets,
      (target) =>
        resolveNativeReferent(target.targetDir).pipe(Effect.map((key) => ({ key, target }))),
      { concurrency: 1 },
    );
    const locationsByKey = new Map<
      string,
      { targetDir: string; agentIds: Array<MaterializationTargetId> }
    >();
    // Shared Skill publication is workspace policy, independently of membership.
    locationsByKey.set(sharedDir, { targetDir: sharedDir, agentIds: [] });
    for (const { key, target } of keyedTargets) {
      const existing = locationsByKey.get(key);
      if (existing === undefined) {
        locationsByKey.set(key, { targetDir: key, agentIds: [target.agentId] });
        continue;
      }
      if (!existing.agentIds.includes(target.agentId)) {
        existing.agentIds.push(target.agentId);
      }
    }
    return [...locationsByKey.values()];
  });

export const skillArtifactFromTargets = (args: {
  readonly targets: ReadonlyArray<InstallableSkillTarget>;
  readonly workspaceRoot: string;
  readonly sanitizedName: string;
  readonly scope: JobStepArtifact["scope"];
  readonly change: JobStepArtifact["change"];
  readonly workspaceTargets?: ReadonlyArray<JobStepArtifactTarget>;
}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const targetLocations = yield* groupInstallTargetsByDirectory(args.targets, args.workspaceRoot);
    const artifactTargets = [
      ...(args.workspaceTargets ?? []),
      ...targetLocations.map((location) => {
        const agentIds = artifactTargetAgentIds(location.agentIds);
        return {
          path: path.relative(
            args.workspaceRoot,
            path.join(location.targetDir, args.sanitizedName),
          ),
          change: args.change,
          ...(agentIds.length > 0 ? { agentIds } : {}),
        };
      }),
    ];
    const displayPath = artifactTargets[0]?.path ?? args.sanitizedName;
    const artifactAgents = artifactAgentIdsFromTargets(args.targets);
    return {
      path: displayPath,
      scope: args.scope,
      agents: artifactAgents,
      change: args.change,
      ...(artifactTargets.length > 0 ? { targets: artifactTargets } : {}),
    } satisfies JobStepArtifact;
  });
