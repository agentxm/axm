import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import type * as Config from "effect/Config";
import {
  ExtensionPaths,
  LockfileReader,
  SettingsReader,
  WorkspaceLocation,
} from "../../../desired-state/index.js";

import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import {
  SkillManager,
  artifactAgentIdsFromTargets,
  artifactTargetAgentIds,
  groupInstallTargetsByDirectory,
  type InstallableSkillTarget,
} from "../../../materialization/index.js";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import {
  isVersionEntryEligibleAt,
  parseMinimumReleaseAge,
  releaseAgeExemptionForIdentity,
} from "../../../resolution/index.js";
import { RegistryClientFactory } from "@agentxm/registry-client";
import { CodingAgentRepository } from "../../../projection/index.js";
import {
  sanitizeName,
  type SkillLockEntry,
  type SkillPathSource,
} from "../../../desired-state/index.js";
import type { ExtensionLifecycleFailed } from "../../../lifecycle/errors.js";
import {
  installRefused,
  type InstallStepRequirements,
} from "../../../lifecycle/install/vocabulary.js";
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
        ...(ref.owner === undefined ? {} : { owner: ref.owner }),
        source: ref.source,
        ...(ref.sourcePath === undefined ? {} : { sourcePath: ref.sourcePath }),
        ...(ref.portable === undefined ? {} : { portable: ref.portable }),
      };
    case "local":
      return {
        refType: "local",
        ...(ref.owner === undefined ? {} : { owner: ref.owner }),
        source: ref.source,
        ...(ref.sourcePath === undefined ? {} : { sourcePath: ref.sourcePath }),
        ...(ref.portable === undefined ? {} : { portable: ref.portable }),
      };
    case "workspace":
      return { refType: "workspace", owner: ref.owner };
  }
};

/** The version an accepted Registry resolution names; other sources carry none. */
const acceptedVersion = (entry: SkillLockEntry): string | undefined =>
  entry.source.type === "registry" && "version" in entry.resolved
    ? entry.resolved.version
    : undefined;

interface ReleaseAgeFact {
  readonly minimumAge: string;
  readonly mature: boolean;
}

/**
 * Whether an explicitly requested release is younger than the configured
 * minimum age. An attended install enforces nothing — it only says so — but
 * the age is judged by the one eligibility rule every unattended selection
 * uses, under the same identity exemptions. The setting parses under that
 * policy too, so an unreadable value refuses the install rather than reading
 * as "no minimum"; only the Registry lookup that dates the release is
 * best-effort.
 */
const releaseAge = (ref: Extract<SkillExtensionRef, { readonly refType: "registry" }>) =>
  Effect.gen(function* () {
    const settings = yield* SettingsReader;
    const unreadable = (cause: unknown) =>
      installRefused({
        category: "internal",
        detail: "The minimum release age settings could not be read",
        cause,
      });

    const configured = yield* settings.minimumReleaseAge.pipe(Effect.mapError(unreadable));
    const minimumReleaseAge = yield* parseMinimumReleaseAge(configured).pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: cause.category,
          detail: cause.detail ?? `Invalid minimumReleaseAge "${configured}"`,
          ...(cause.recover === undefined ? {} : { recover: cause.recover }),
          cause,
        }),
      ),
    );
    if (Duration.isLessThanOrEqualTo(minimumReleaseAge, Duration.zero)) {
      return Option.none<ReleaseAgeFact>();
    }
    const evaluation = {
      minimumReleaseAge,
      evaluatedAt: yield* DateTime.now,
      mode: "enforce",
      exclude: yield* settings.minimumReleaseAgeExclude.pipe(Effect.mapError(unreadable)),
    } as const;
    const exemption = releaseAgeExemptionForIdentity(evaluation, {
      owner: ref.owner,
      type: "skill",
      name: ref.name,
    });
    if (exemption !== undefined) return Option.none<ReleaseAgeFact>();

    return yield* Effect.gen(function* () {
      const client = yield* (yield* RegistryClientFactory).forLocation(ref.source.location);
      const index = yield* client.getExtensionIndex({
        owner: ref.owner,
        type: "skill",
        name: ref.name,
      });
      if (Option.isNone(index)) return Option.none<ReleaseAgeFact>();

      const versionEntry = index.value.versions.find((entry) => entry.version === ref.version);
      if (versionEntry === undefined) return Option.none<ReleaseAgeFact>();
      return Option.some({
        minimumAge: configured,
        mature: isVersionEntryEligibleAt(versionEntry, evaluation),
      });
    }).pipe(
      Effect.catch((error) =>
        error._tag === "ConfigError"
          ? Effect.fail(error)
          : Effect.succeed(Option.none<ReleaseAgeFact>()),
      ),
    );
  });

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
    const workspaceLocation = yield* WorkspaceLocation;
    const paths = yield* ExtensionPaths;
    const lockfile = yield* LockfileReader;
    const skillManager = yield* SkillManager;
    const agentRepo = yield* CodingAgentRepository;
    const path = yield* Path.Path;

    const previousLockEntry = yield* lockfile
      .entry("skill", ref.skill.name)
      .pipe(Effect.catch(() => Effect.succeed(Option.none())));
    const previousVersion = Option.match(previousLockEntry, {
      onNone: () => undefined,
      onSome: acceptedVersion,
    });
    const { skillSrcPath } = yield* paths.skillDir(ref.skill.name, skillPathSourceFor(ref));
    const configuredAgents = yield* agentRepo.getMaterializationAgents();
    const resolvedAgents = yield* Effect.forEach(
      configuredAgents,
      (agent) =>
        agent
          .resolveEffectiveSkillsDir({ workspaceRoot: workspaceLocation.baseDir })
          .pipe(Effect.map((outcome) => ({ agentId: agent.id, outcome }))),
      // eslint-disable-next-line axm-policy/no-unbounded-io -- configured agents are a subset of the fixed agent catalog
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
    const targetLocations = yield* groupInstallTargetsByDirectory(
      installableTargets,
      workspaceLocation.baseDir,
    );
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
              path: path.relative(workspaceLocation.baseDir, linkPath),
              state,
              ...(agentIds.length > 0 ? { agentIds } : {}),
            };
          }),
        );
      },
      // eslint-disable-next-line axm-policy/no-unbounded-io -- target directories come from the fixed agent catalog
      { concurrency: "unbounded" },
    );
    const firstTarget = targets[0];
    const rawDisplayPath =
      firstTarget === undefined
        ? path.relative(workspaceLocation.baseDir, skillSrcPath)
        : firstTarget.path;

    const installed = yield* skillManager
      .isInstalled({ target: { type: "skill", name: ref.skill.name } })
      .pipe(Effect.catch(() => Effect.succeed(false)));
    return {
      installed,
      previousVersion,
      scope: workspaceLocation.scope,
      displayPath: rawDisplayPath,
      agents: artifactAgents,
      unknownAgents,
      unavailableAgents: skippedAgents,
      targets,
    } satisfies SkillInstallationInspection;
  });

const readContent = (ref: SkillExtensionRef) =>
  Effect.gen(function* () {
    const paths = yield* ExtensionPaths;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { skillSrcPath } = yield* paths.skillDir(ref.skill.name, skillPathSourceFor(ref));
    return { fileCount: yield* countFiles(fs, path, skillSrcPath) };
  });

const unavailable = (ref: SkillExtensionRef) => (cause: unknown) =>
  installRefused({
    category: "internal",
    detail: `Skill install planning failed for ${ref.skill.name}`,
    cause,
  });

export const skillInstallationFacts = {
  inspect: (ref) => inspect(ref).pipe(Effect.mapError(unavailable(ref))),
  releaseAge,
  readContent: (ref) => readContent(ref).pipe(Effect.mapError(unavailable(ref))),
} satisfies SkillInstallationFacts<
  ExtensionLifecycleFailed | Config.ConfigError,
  InstallStepRequirements | SkillManager,
  InstallStepRequirements
>;
