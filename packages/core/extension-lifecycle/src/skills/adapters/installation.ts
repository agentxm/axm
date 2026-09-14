import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import {
  SkillManager,
  artifactAgentIdsFromTargets,
  artifactTargetAgentIds,
  computeSkillSourceHash,
  groupInstallTargetsByDirectory,
  type InstallableSkillTarget,
} from "@agentxm/extension-materialization";
import { matchesReleaseAgeExcludePattern } from "@agentxm/extension-model/unstable/extensions";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import { isVersionEntryMature, parseMinimumReleaseAge } from "@agentxm/extension-resolution";
import { createRegistryClient } from "@agentxm/registry-client";
import { CodingAgentRepository } from "@agentxm/workspace-projection";
import { WorkspaceMutations, sanitizeName, type SkillPathSource } from "@agentxm/workspace-state";
import type { ExtensionLifecycleFailed } from "../../errors.js";
import { installRefused, type InstallStepRequirements } from "../../install/vocabulary.js";
import type {
  SkillInstallationFacts,
  SkillInstallationInspection,
} from "../application/installation.js";

const countFiles = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  dir: string,
): Effect.Effect<number> =>
  Effect.gen(function* () {
    const entries = yield* fs.readDirectory(dir).pipe(Effect.catch(() => Effect.succeed([])));
    let total = 0;
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const statOption = yield* fs.stat(fullPath).pipe(Effect.option);
      if (Option.isNone(statOption)) continue;
      if (statOption.value.type === "Directory") {
        total += yield* countFiles(fs, path, fullPath);
      } else {
        total += 1;
      }
    }
    return total;
  });

const skillPathSourceFor = (ref: SkillExtensionRef): SkillPathSource => {
  switch (ref.refType) {
    case "registry":
      return { refType: "registry", owner: ref.owner, source: ref.source };
    case "git-hosted":
      return {
        refType: "git-hosted",
        source: ref.source,
        ...(ref.sourcePath === undefined ? {} : { sourcePath: ref.sourcePath }),
        ...(ref.portable === undefined ? {} : { portable: ref.portable }),
      };
    case "local":
      return {
        refType: "local",
        source: ref.source,
        ...(ref.sourcePath === undefined ? {} : { sourcePath: ref.sourcePath }),
        ...(ref.portable === undefined ? {} : { portable: ref.portable }),
      };
    case "workspace":
      return { refType: "workspace", owner: ref.owner };
  }
};

const previousResolvedVersion = (entry: unknown): string | undefined => {
  if (typeof entry !== "object" || entry === null) return undefined;
  if (!("type" in entry) || entry.type !== "registry") return undefined;
  if (!("resolvedVersion" in entry) || typeof entry.resolvedVersion !== "string") return undefined;
  return entry.resolvedVersion;
};

const previousSourceHash = (entry: unknown): string | undefined => {
  if (typeof entry !== "object" || entry === null) return undefined;
  if (!("sourceHash" in entry) || typeof entry.sourceHash !== "string") return undefined;
  return entry.sourceHash;
};

const releaseAge = (ref: Extract<SkillExtensionRef, { readonly refType: "registry" }>) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;

    const excluded = (yield* ws.getMinimumReleaseAgeExclude()).some(({ pattern }) =>
      matchesReleaseAgeExcludePattern(pattern, {
        owner: ref.owner,
        type: "skill",
        name: ref.name,
      }),
    );
    if (excluded) return Option.none<{ readonly minimumAge: string; readonly mature: boolean }>();

    const minimumReleaseAge = yield* ws.getMinimumReleaseAge();
    const minimumAge = parseMinimumReleaseAge(minimumReleaseAge);
    if (
      Option.isNone(minimumAge) ||
      Duration.isLessThanOrEqualTo(minimumAge.value, Duration.zero)
    ) {
      return Option.none<{ readonly minimumAge: string; readonly mature: boolean }>();
    }

    const location =
      ref.source.location.protocol === "file:"
        ? ref.source.location.pathname
        : ref.source.location.href;
    const client = yield* createRegistryClient(location);
    const index = yield* client.getExtensionIndex({
      owner: ref.owner,
      type: "skill",
      name: ref.name,
    });
    if (Option.isNone(index))
      return Option.none<{ readonly minimumAge: string; readonly mature: boolean }>();

    const versionEntry = index.value.versions.find((entry) => entry.version === ref.version);
    if (versionEntry === undefined)
      return Option.none<{ readonly minimumAge: string; readonly mature: boolean }>();
    return Option.some({
      minimumAge: minimumReleaseAge,
      mature: yield* isVersionEntryMature(versionEntry, minimumAge.value),
    });
  }).pipe(
    Effect.catch(() =>
      Effect.succeed(Option.none<{ readonly minimumAge: string; readonly mature: boolean }>()),
    ),
  );

const targetState = (args: { readonly linkPath: string; readonly canonicalSkillSrcPath: string }) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const linkTarget = yield* fs.readLink(args.linkPath).pipe(Effect.option);
    if (Option.isSome(linkTarget)) {
      const currentAbsoluteTarget = path.resolve(path.dirname(args.linkPath), linkTarget.value);
      const resolvedCurrentTarget = yield* fs
        .realPath(currentAbsoluteTarget)
        .pipe(Effect.catch(() => Effect.succeed(currentAbsoluteTarget)));
      const resolvedExpectedTarget = yield* fs
        .realPath(args.canonicalSkillSrcPath)
        .pipe(Effect.catch(() => Effect.succeed(args.canonicalSkillSrcPath)));
      return resolvedCurrentTarget === resolvedExpectedTarget ? "current" : "different";
    }
    const exists = yield* fs.exists(args.linkPath).pipe(Effect.catch(() => Effect.succeed(false)));
    return exists ? "different" : "absent";
  });

const inspect = (ref: SkillExtensionRef) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const skillManager = yield* SkillManager;
    const agentRepo = yield* CodingAgentRepository;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const previousLockEntry = yield* ws
      .getLockedSkill(ref.skill.name)
      .pipe(Effect.catch(() => Effect.succeed(Option.none())));
    const previousVersion = Option.match(previousLockEntry, {
      onNone: () => undefined,
      onSome: previousResolvedVersion,
    });
    const { skillSrcPath } = yield* ws.getSkillDir(ref.skill.name, skillPathSourceFor(ref));
    const sourceHashBeforeInstall =
      Option.match(previousLockEntry, {
        onNone: () => undefined,
        onSome: previousSourceHash,
      }) ??
      (yield* Effect.gen(function* () {
        const exists = yield* fs
          .exists(skillSrcPath)
          .pipe(Effect.catch(() => Effect.succeed(false)));
        if (!exists) return undefined;
        return yield* computeSkillSourceHash(skillSrcPath);
      }));
    const configuredAgents = yield* agentRepo.getMaterializationAgents();
    const resolvedAgents = yield* Effect.forEach(
      configuredAgents,
      (agent) =>
        agent
          .resolveEffectiveSkillsDir({ workspaceRoot: ws.baseDir })
          .pipe(Effect.map((outcome) => ({ agentId: agent.id, outcome }))),
      { concurrency: "unbounded" },
    );
    const unknownAgents = yield* agentRepo.getUnknownConfiguredAgentIds();
    const skippedAgents = resolvedAgents.flatMap(({ agentId, outcome }) =>
      outcome._tag === "unsupported" || outcome._tag === "disabled"
        ? [`${agentId}: ${outcome.reason}`]
        : [],
    );
    const sanitizedName = sanitizeName(ref.skill.name);
    const installableTargets = resolvedAgents.flatMap(
      ({ agentId, outcome }): ReadonlyArray<InstallableSkillTarget> =>
        outcome._tag === "supported" ? [{ agentId, targetDir: path.normalize(outcome.dir) }] : [],
    );
    const targetLocations = yield* groupInstallTargetsByDirectory(installableTargets, ws.baseDir);
    const artifactAgents = artifactAgentIdsFromTargets(installableTargets);
    const targets = yield* Effect.forEach(
      targetLocations,
      (location) => {
        const linkPath = path.join(location.targetDir, sanitizedName);
        return targetState({
          linkPath,
          canonicalSkillSrcPath: skillSrcPath,
        }).pipe(
          Effect.map((state) => {
            const agentIds = artifactTargetAgentIds(location.agentIds);
            return {
              path: path.relative(ws.baseDir, linkPath),
              state,
              ...(agentIds.length > 0 ? { agentIds } : {}),
            };
          }),
        );
      },
      { concurrency: "unbounded" },
    );
    const firstTarget = targets[0];
    const rawDisplayPath =
      firstTarget === undefined ? path.relative(ws.baseDir, skillSrcPath) : firstTarget.path;

    const installedBefore = yield* skillManager
      .isInstalled({ target: { type: "skill", name: ref.skill.name } })
      .pipe(Effect.catch(() => Effect.succeed(false)));
    return {
      installed: installedBefore,
      previousVersion,
      sourceHash: sourceHashBeforeInstall,
      scope: ws.scope,
      displayPath: rawDisplayPath,
      agents: artifactAgents,
      unknownAgents,
      unavailableAgents: skippedAgents,
      targets,
    } satisfies SkillInstallationInspection;
  });

const readContent = (ref: SkillExtensionRef) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { skillSrcPath } = yield* ws.getSkillDir(ref.skill.name, skillPathSourceFor(ref));
    return {
      fileCount: yield* countFiles(fs, path, skillSrcPath),
      sourceHash: yield* computeSkillSourceHash(skillSrcPath),
    };
  });

const unavailable = (ref: SkillExtensionRef) => (cause: unknown) =>
  installRefused({
    category: "internal",
    detail: `Skill install planning failed for ${ref.skill.name}`,
    cause,
  });

export const skillInstallationFacts: SkillInstallationFacts<
  ExtensionLifecycleFailed,
  InstallStepRequirements | SkillManager,
  InstallStepRequirements
> = {
  inspect: (ref) => inspect(ref).pipe(Effect.mapError(unavailable(ref))),
  releaseAge,
  readContent: (ref) => readContent(ref).pipe(Effect.mapError(unavailable(ref))),
};
