/**
 * Skill artifact and install-target semantics shared by the lifecycle and
 * sync features: agent-target grouping, universal-directory folding, and the
 * step-artifact shape describing where a skill materializes.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type { AgentId } from "@agentxm/extension-model/unstable/agents/types";
import {
  UNIVERSAL_SKILLS_DIR,
  isUniversalSkillsDir,
  stripTrailingSeparators,
} from "@agentxm/extension-model/unstable/extensions/universal-skills-dir";
import type { JobStepArtifact, JobStepArtifactTarget } from "@agentxm/workspace-operations";

export type InstallableSkillTarget = {
  readonly agentId: AgentId;
  readonly targetDir: string;
};

export type InstallableSkillTargetLocation = {
  readonly targetDir: string;
  readonly agentIds: ReadonlyArray<AgentId>;
};

const UNIVERSAL_AGENT_ID = "universal";

export const artifactAgentIdsFromTargets = (
  targets: ReadonlyArray<InstallableSkillTarget>,
): ReadonlyArray<string> =>
  Array.dedupe(
    targets.map((target) => target.agentId).filter((agentId) => agentId !== UNIVERSAL_AGENT_ID),
  );

export const artifactTargetAgentIds = (agentIds: ReadonlyArray<AgentId>): ReadonlyArray<string> =>
  agentIds.filter((agentId) => agentId !== UNIVERSAL_AGENT_ID);

const normalizedTargetDir = (path: Path.Path, targetDir: string): string =>
  stripTrailingSeparators(path.normalize(targetDir));

const targetLocationKey = (
  targetDir: string,
  workspaceRoot: string,
): Effect.Effect<string, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const normalizedDir = normalizedTargetDir(path, targetDir);
    const normalizedWorkspaceRoot = normalizedTargetDir(path, workspaceRoot);
    const realWorkspaceRoot = yield* fs.realPath(workspaceRoot).pipe(
      Effect.map((realPath) => normalizedTargetDir(path, realPath)),
      Effect.catch(() => Effect.succeed(normalizedWorkspaceRoot)),
    );

    if (
      isUniversalSkillsDir(normalizedDir, normalizedWorkspaceRoot) ||
      isUniversalSkillsDir(normalizedDir, realWorkspaceRoot)
    ) {
      return normalizedTargetDir(path, path.join(realWorkspaceRoot, UNIVERSAL_SKILLS_DIR));
    }

    const parentDir = path.dirname(normalizedDir);
    const realParentDir = yield* fs.realPath(parentDir).pipe(
      Effect.map((realPath) => normalizedTargetDir(path, realPath)),
      Effect.catch(() => Effect.succeed(parentDir)),
    );
    return normalizedTargetDir(path, path.join(realParentDir, path.basename(normalizedDir)));
  });

export const groupInstallTargetsByDirectory = (
  targets: ReadonlyArray<InstallableSkillTarget>,
  workspaceRoot: string,
): Effect.Effect<
  ReadonlyArray<InstallableSkillTargetLocation>,
  never,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const keyedTargets = yield* Effect.forEach(
      targets,
      (target) =>
        targetLocationKey(target.targetDir, workspaceRoot).pipe(
          Effect.map((key) => ({ key, target })),
        ),
      { concurrency: "unbounded" },
    );
    const locationsByKey = new Map<string, { targetDir: string; agentIds: Array<AgentId> }>();
    for (const { key, target } of keyedTargets) {
      const existing = locationsByKey.get(key);
      if (existing === undefined) {
        locationsByKey.set(key, { targetDir: target.targetDir, agentIds: [target.agentId] });
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
