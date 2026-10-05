import { skillDirectoryNameForRef } from "@agentxm/workspace-kernel/acquisition";
import {
  type NativeLocationOutcome,
  resolveNativeEntry,
  resolveNativeReferent,
  copiedDirectoryIsCurrent,
} from "@agentxm/workspace-kernel/locations";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import type * as Config from "effect/Config";
import {
  ExtensionPaths,
  LockfileReader,
  SettingsReader,
  WorkspaceLocation,
  lockEntryVersion,
} from "@agentxm/workspace-kernel/workspace-state";

import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import {
  SkillManager,
  artifactAgentIdsFromTargets,
  artifactTargetAgentIds,
  groupInstallTargetsByDirectory,
  type InstallableSkillTarget,
} from "@agentxm/workspace-kernel/materialization";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import {
  isVersionEntryEligibleAt,
  parseMinimumReleaseAge,
  releaseAgeExemptionForIdentity,
} from "@agentxm/workspace-kernel/resolution";
import { RegistryClientFactory } from "@agentxm/registry-client";
import {
  nativeArtifactLocationOutcomes,
  CodingAgentRepository,
} from "@agentxm/workspace-kernel/projection";
import {
  type ExtensionLifecycleFailed,
  installRefused,
} from "@agentxm/workspace-kernel/operations";
import type {
  SkillInstallationFacts,
  SkillInstallationInspection,
} from "../application/installation.js";
import type { InstallStepRequirements } from "@agentxm/workspace-kernel/reconciliation";

const countFiles = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  dir: string,
): Effect.Effect<number, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const entries = yield* fs.readDirectory(dir).pipe(Effect.catch(() => Effect.succeed([])));
    let total = 0;
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const observed = yield* resolveNativeEntry(fullPath).pipe(Effect.option);
      if (Option.isNone(observed) || observed.value.kind === "absent") continue;
      if (observed.value.kind === "directory") {
        total += yield* countFiles(fs, path, fullPath);
      } else {
        total += 1;
      }
    }
    return total;
  });

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
    const path = yield* Path.Path;
    const entry = yield* resolveNativeEntry(args.linkPath);
    const source = yield* resolveNativeReferent(args.canonicalSkillSrcPath);
    if (entry.entryPath === source) return "current";
    if (yield* copiedDirectoryIsCurrent(entry.entryPath, source)) return "current";
    if (entry.kind === "symlink" && entry.linkTarget !== undefined) {
      const immediate = yield* resolveNativeEntry(
        path.resolve(path.dirname(entry.entryPath), entry.linkTarget),
      );
      return immediate.entryPath === source && immediate.kind !== "symlink"
        ? "current"
        : "different";
    }
    return entry.kind === "absent" ? "absent" : "different";
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
      onSome: lockEntryVersion,
    });
    const { skillSrcPath } = yield* paths.skillDir(ref.skill.name, ref);
    const configuredAgents = yield* agentRepo.getMaterializationAgents();
    const resolvedAgents = yield* Effect.forEach(
      configuredAgents,
      (agent) =>
        agent
          .resolveEffectiveSkillsDir({
            workspaceRoot: workspaceLocation.baseDir,
            scope: workspaceLocation.scope,
          })
          .pipe(Effect.map((outcome) => ({ agentId: agent.id, outcome }))),
      // eslint-disable-next-line axm-policy/no-unbounded-io -- configured agents are a subset of the fixed agent catalog
      { concurrency: "unbounded" },
    );
    const unknownAgents = yield* agentRepo.getUnknownConfiguredAgentIds();
    const skippedAgents = resolvedAgents.flatMap(({ agentId, outcome }) =>
      outcome._tag === "unsupported" || outcome._tag === "disabled" || outcome._tag === "unverified"
        ? [`${agentId}: ${outcome.reason}`]
        : [],
    );
    const directoryName = yield* skillDirectoryNameForRef(ref);
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
      targetLocations.flatMap((location) =>
        Option.toArray(directoryName).map((name) => ({ ...location, name })),
      ),
      (location) => {
        const linkPath = path.join(location.targetDir, location.name);
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
    const proposed = yield* nativeArtifactLocationOutcomes({
      workspaceRoot: workspaceLocation.baseDir,
      scope: workspaceLocation.scope,
      agents: yield* agentRepo.all,
      configuredAgentIds: new Set(configuredAgents.map((agent) => agent.id)),
      sharedSkillPolicy: true,
      targets: targets.map((target) => ({
        path: target.path,
        kind: "skill" as const,
        sourcePath: skillSrcPath,
        state:
          target.state === "absent"
            ? ("created" as const)
            : target.state === "current"
              ? ("unchanged" as const)
              : ("updated" as const),
      })),
    });
    const nativeLocations = proposed.map((unit) => {
      const current = targets.some(
        (target) =>
          unit.aliases.includes(path.resolve(workspaceLocation.baseDir, target.path)) &&
          target.state === "current",
      );
      if (current || unit.ownership === "absent") return unit;
      const { proof: _proof, ...facts } = unit;
      return {
        ...facts,
        ownership: "unverified" as const,
        reason: "Existing native content has not been verified as owned by this installation.",
      };
    });
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
      nativeLocations,
      targets,
    } satisfies SkillInstallationInspection<NativeLocationOutcome>;
  });

const readContent = (ref: SkillExtensionRef) =>
  Effect.gen(function* () {
    const paths = yield* ExtensionPaths;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { skillSrcPath } = yield* paths.skillDir(ref.skill.name, ref);
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
  InstallStepRequirements,
  NativeLocationOutcome
>;
