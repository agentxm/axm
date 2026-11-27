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
import type { ConfigurableAgentId } from "@agentxm/extension-model/unstable/agent-capabilities/identity";
import { UNIVERSAL_SKILLS_DIR } from "@agentxm/extension-model/unstable/extensions/universal-skills-dir";
import type { JobStepArtifact, JobStepArtifactTarget } from "../operations/index.js";

export type InstallableSkillTarget = {
  readonly agentId: ConfigurableAgentId;
  readonly targetDir: string;
};

export type InstallableSkillTargetLocation = {
  readonly targetDir: string;
  readonly agentIds: ReadonlyArray<ConfigurableAgentId>;
};

export const artifactAgentIdsFromTargets = (
  targets: ReadonlyArray<InstallableSkillTarget>,
): ReadonlyArray<string> => Array.dedupe(targets.map((target) => target.agentId));

export const artifactTargetAgentIds = (
  agentIds: ReadonlyArray<ConfigurableAgentId>,
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
    // Within one grouping, an identical spelling resolves to the same referent;
    // distinct spellings and aliases are still resolved, and failures are never kept.
    const referents = new Map<string, string>();
    const resolveOnce = (input: string) =>
      Effect.suspend(() => {
        const key = path.resolve(input);
        const known = referents.get(key);
        return known === undefined
          ? resolveNativeReferent(input).pipe(
              Effect.tap((referent) => Effect.sync(() => referents.set(key, referent))),
            )
          : Effect.succeed(known);
      });
    const sharedDir = yield* resolveOnce(path.join(workspaceRoot, UNIVERSAL_SKILLS_DIR));
    const keyedTargets = yield* Effect.forEach(
      targets,
      (target) => resolveOnce(target.targetDir).pipe(Effect.map((key) => ({ key, target }))),
      { concurrency: 1 },
    );
    const locationsByKey = new Map<
      string,
      { targetDir: string; agentIds: Array<ConfigurableAgentId> }
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

/**
 * The step artifact naming where a skill materializes, from install targets
 * already grouped by physical directory. Each artifact target owns its
 * consumer list, so several artifacts may be described from one grouping.
 */
export const skillArtifactFromLocations = (args: {
  readonly locations: ReadonlyArray<InstallableSkillTargetLocation>;
  readonly targets: ReadonlyArray<InstallableSkillTarget>;
  readonly workspaceRoot: string;
  readonly sanitizedName: string;
  readonly scope: JobStepArtifact["scope"];
  readonly change: JobStepArtifact["change"];
  readonly workspaceTargets?: ReadonlyArray<JobStepArtifactTarget>;
}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const artifactTargets = [
      ...(args.workspaceTargets ?? []),
      ...args.locations.map((location) => {
        const agentIds = [...artifactTargetAgentIds(location.agentIds)];
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

export const skillArtifactFromTargets = (args: {
  readonly targets: ReadonlyArray<InstallableSkillTarget>;
  readonly workspaceRoot: string;
  readonly sanitizedName: string;
  readonly scope: JobStepArtifact["scope"];
  readonly change: JobStepArtifact["change"];
  readonly workspaceTargets?: ReadonlyArray<JobStepArtifactTarget>;
}) =>
  groupInstallTargetsByDirectory(args.targets, args.workspaceRoot).pipe(
    Effect.flatMap((locations) => skillArtifactFromLocations({ ...args, locations })),
  );
