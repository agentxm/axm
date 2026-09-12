/**
 * Installing skills.
 *
 * A skill is acquired once into the canonical tree and then projected into
 * every configured agent's skills directory, so this decides which source
 * supplies it, which of that source's skills the request wants, what each
 * projection target's change will be before anything is written, and whether
 * a version this new deserves a release-age warning.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Array from "effect/Array";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import type * as HttpClient from "effect/unstable/http/HttpClient";

import {
  SkillManager,
  artifactAgentIdsFromTargets,
  artifactTargetAgentIds,
  computeSkillSourceHash,
  groupInstallTargetsByDirectory,
  type InstallableSkillTarget,
} from "@agentxm/extension-materialization";
import { buildInstallOperation } from "@agentxm/workspace-reconciliation";
import {
  matchesReleaseAgeExcludePattern,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import {
  PackageUrlPartsSchema,
  formatPackageDisplay,
  type PackageUrlParts,
} from "@agentxm/extension-model/unstable/packaging";
import {
  parseInputPattern,
  type InputParseResult,
} from "@agentxm/extension-model/unstable/sources/parser";
import type { Source } from "@agentxm/extension-model/unstable/sources/types";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import { isVersionEntryMature, parseMinimumReleaseAge } from "@agentxm/extension-resolution";
import { SourceHostProviders, type SourceResolutionFailure } from "@agentxm/extension-sources";
import { createRegistryClient } from "@agentxm/registry-client";
import {
  operationPresentation,
  type JobStepArtifact,
  type JobStepArtifactTarget,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import { CodingAgentRepository } from "@agentxm/workspace-projection";
import { WorkspaceMutations, sanitizeName, type SkillPathSource } from "@agentxm/workspace-state";

import type { ExtensionLifecycleFailed } from "../../errors.js";
import { gitHostedSkillArtifactSource } from "../operations/install.js";
import { lifecycleStepFailure } from "../../step-failure.js";
import type { RegistryLookupProbe } from "../../install/registry-source-resolution.js";
import type { ExtensionSelectionCancelled } from "../../install/selection-interaction.js";
import { ExtensionSelectionInteraction } from "../../install/selection-interaction.js";
import {
  installRefused,
  type InstallStepRequirements,
  type ResolveInstallRequirements,
  type SkillInstallIntent,
} from "../../install/vocabulary.js";
import { determineSkillsToInstall } from "./selection.js";
import { resolveSkillInstallSource } from "./source.js";

/** A skill source after grammar parsing, before anything is discovered. */
export interface ParsedSkillInstallRequest {
  readonly source: Source;
  readonly versionRange: Option.Option<VersionRange>;
  readonly requestedSkills: ReadonlyArray<string>;
  readonly requestedOwner: Option.Option<Handle>;
  /** Which configured registry hosts were consulted, and what each answered. */
  readonly resolutionProbes: ReadonlyArray<RegistryLookupProbe>;
  readonly all: boolean;
  readonly force: boolean;
  readonly nonInteractive: boolean;
}

const noSkillsFoundHowToFix = (source: Source): string => {
  if (source.type === "registry") {
    return "Verify the owner and skill name exist in the configured registry";
  }
  if (source.type === "local") {
    return "Verify the source path contains directories with SKILL.md files";
  }
  return "Verify the source contains skill directories with SKILL.md files";
};

const decodePackageUrlParts = Schema.decodeUnknownResult(Schema.toType(PackageUrlPartsSchema));

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

const artifactChangeFromTargets = (
  fallback: JobStepArtifact["change"],
  targets: ReadonlyArray<{ readonly change?: JobStepArtifact["change"] }>,
): JobStepArtifact["change"] => {
  if (targets.length === 0) return fallback;
  if (targets.some((target) => target.change === "created")) return "created";
  if (targets.some((target) => target.change === "updated" || target.change === undefined)) {
    return "updated";
  }
  return fallback === "updated" ? "updated" : "unchanged";
};

const appendWarningToResult =
  (warning: string) =>
  (result: JobStepResult): JobStepResult => {
    if (result.result === "error") return result;
    return {
      ...result,
      warnings: [...(result.warnings ?? []), warning],
      message: result.message.length === 0 ? warning : `${result.message}; ${warning}`,
    };
  };

const withPlanWarning = (
  step: PlannedJobStep<InstallStepRequirements>,
  warning: Option.Option<string>,
): PlannedJobStep<InstallStepRequirements> => {
  if (Option.isNone(warning) || step.readiness === "error") return step;
  if (step.readiness === "warn") {
    return { ...step, run: step.run.pipe(Effect.map(appendWarningToResult(warning.value))) };
  }
  return {
    ...step,
    message: warning.value,
    run: step.run.pipe(Effect.map(appendWarningToResult(warning.value))),
  };
};

/**
 * The packages a skill declares itself compatible with. Registry refs carry
 * them as a typed field; a local or git-hosted skill may declare them in its
 * generic metadata bag, where an invalid entry is skipped rather than
 * failing the whole install.
 */
export const getCompanionPackages = (ref: SkillExtensionRef): ReadonlyArray<PackageUrlParts> => {
  if (ref.refType === "registry") return ref.packages ?? [];
  return Option.match(ref.skill.metadata, {
    onNone: (): ReadonlyArray<PackageUrlParts> => [],
    onSome: (metadata) => {
      const raw = metadata["packages"];
      if (!globalThis.Array.isArray(raw)) return [];
      return raw.flatMap((entry: unknown) => {
        const decoded = decodePackageUrlParts(entry);
        return Result.isSuccess(decoded) ? [decoded.success] : [];
      });
    },
  });
};

/** Companion-package orientation the application renders beside the preview. */
export interface CompanionPackagesSection {
  readonly title: string;
  readonly items: ReadonlyArray<string>;
}

/** The deduplicated compatible-package list a set of skill refs declares. */
export const buildCompanionPackagesSection = (
  refs: ReadonlyArray<SkillExtensionRef>,
): CompanionPackagesSection | undefined => {
  const allPackages = refs.flatMap((ref) => getCompanionPackages(ref));
  if (allPackages.length === 0) return undefined;
  const seen = new Set<string>();
  const items: Array<string> = [];
  for (const pkg of allPackages) {
    const formatted = formatPackageDisplay(pkg);
    if (!seen.has(formatted)) {
      seen.add(formatted);
      items.push(formatted);
    }
  }
  return { title: "Compatible packages", items };
};

const extractRequestedSkills = (
  argSkills: ReadonlyArray<string>,
  parsedSource: InputParseResult,
): ReadonlyArray<string> =>
  argSkills.length > 0
    ? argSkills
    : parsedSource.pattern.pattern === "name-input"
      ? [parsedSource.pattern.name]
      : parsedSource.pattern.pattern === "registry-pattern-input"
        ? Option.isSome(parsedSource.pattern.name)
          ? [parsedSource.pattern.name.value]
          : []
        : [];

const extractRequestedOwner = (
  parsedSource: InputParseResult,
  source: Source,
): Option.Option<Handle> =>
  parsedSource.pattern.pattern === "registry-pattern-input"
    ? Option.some(parsedSource.pattern.owner)
    : source.type === "registry"
      ? source.owner
      : Option.none<Handle>();

/** What a skill install command supplies before anything is parsed. */
export interface SkillInstallArgs {
  readonly source: string;
  readonly skills: ReadonlyArray<string>;
  readonly all: boolean;
  readonly force: boolean;
  readonly nonInteractive: boolean;
}

/** Read the skill source grammar and route it to the source that serves it. */
export const parseSkillInstallRequest: (
  args: SkillInstallArgs,
) => Effect.Effect<
  ParsedSkillInstallRequest,
  ExtensionLifecycleFailed | SourceResolutionFailure,
  ResolveInstallRequirements
> = Effect.fn("InstallExtensions.parseSkillRequest")(function* (args: SkillInstallArgs) {
  const parsedSourceOption = parseInputPattern(args.source.trim());
  if (Option.isNone(parsedSourceOption)) {
    return yield* installRefused({
      category: "validation",
      detail: "Invalid source: Unable to parse source",
      recover:
        "Valid formats: local path, github:owner/repo, gitlab:owner/repo, or https://example.com",
    });
  }

  const parsedSource = parsedSourceOption.value;
  const versionRange =
    parsedSource.pattern.pattern === "registry-pattern-input"
      ? parsedSource.pattern.versionRange
      : Option.none<VersionRange>();

  const resolutionProbes: Array<RegistryLookupProbe> = [];
  const source = yield* resolveSkillInstallSource(parsedSource, {
    onRegistryProbe: (probe) => {
      resolutionProbes.push(probe);
    },
  });

  return {
    source,
    versionRange,
    requestedSkills: extractRequestedSkills(args.skills, parsedSource),
    requestedOwner: extractRequestedOwner(parsedSource, source),
    resolutionProbes,
    all: args.all,
    force: args.force,
    nonInteractive: args.nonInteractive,
  } satisfies ParsedSkillInstallRequest;
});

/** Discover the skills the parsed source offers, or refuse when it has none. */
export const discoverSkillRefs: (
  request: ParsedSkillInstallRequest,
) => Effect.Effect<
  ReadonlyArray<SkillExtensionRef>,
  ExtensionLifecycleFailed,
  ResolveInstallRequirements
> = Effect.fn("InstallExtensions.discoverSkills")(function* (request: ParsedSkillInstallRequest) {
  const sources = yield* SourceHostProviders;
  const discovered = yield* sources
    .find(request.source, {
      names: request.source.type === "registry" ? request.requestedSkills : [],
      type: "skill" as const,
      owner: request.requestedOwner,
      versionRange: request.versionRange,
    })
    .pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "network",
          detail: "Skills could not be discovered from the source",
          cause,
        }),
      ),
      Effect.map(Array.filter((ref): ref is SkillExtensionRef => ref.type === "skill")),
    );
  if (Array.isReadonlyArrayEmpty(discovered)) {
    return yield* installRefused({
      category: "not_found",
      detail: "No skills found in source",
      recover: noSkillsFoundHowToFix(request.source),
    });
  }
  return discovered;
});

/** Settle which of the discovered skills this request installs. */
export const finalizeSkillInstallIntent: (
  request: ParsedSkillInstallRequest,
  discovered: ReadonlyArray<SkillExtensionRef>,
) => Effect.Effect<
  SkillInstallIntent,
  ExtensionLifecycleFailed | ExtensionSelectionCancelled,
  ExtensionSelectionInteraction
> = Effect.fn("InstallExtensions.finalizeSkillIntent")(function* (
  request: ParsedSkillInstallRequest,
  discovered: ReadonlyArray<SkillExtensionRef>,
) {
  const [first, ...rest] = discovered;
  if (first === undefined) {
    return yield* installRefused({ category: "not_found", detail: "No skills found in source" });
  }
  const candidates: Array.NonEmptyReadonlyArray<SkillExtensionRef> = [first, ...rest];
  const selected = yield* determineSkillsToInstall(candidates, {
    requestedSkills: request.requestedSkills,
    all: request.all,
    nonInteractive: request.nonInteractive,
  });

  if (Array.isReadonlyArrayEmpty(selected)) {
    return { skillsToInstall: [] } satisfies SkillInstallIntent;
  }

  return {
    skillsToInstall: selected.map((ref) => ({
      ref,
      versionRange: ref.refType === "registry" ? request.versionRange : Option.none<VersionRange>(),
    })),
    force: request.force,
  } satisfies SkillInstallIntent;
});

/**
 * Warn when a registry version this install accepts is younger than the
 * workspace's minimum release age. The version was requested explicitly, so
 * the policy does not hold it back — it only says so.
 */
const brandNewReleaseAgeWarning = (ref: SkillExtensionRef, installedBefore: boolean) =>
  Effect.gen(function* () {
    if (installedBefore || ref.refType !== "registry") return Option.none<string>();
    const ws = yield* WorkspaceMutations;

    const excluded = (yield* ws.getMinimumReleaseAgeExclude()).some(({ pattern }) =>
      matchesReleaseAgeExcludePattern(pattern, {
        owner: ref.owner,
        type: "skill",
        name: ref.name,
      }),
    );
    if (excluded) return Option.none<string>();

    const minimumReleaseAge = yield* ws.getMinimumReleaseAge();
    const minimumAge = parseMinimumReleaseAge(minimumReleaseAge);
    if (
      Option.isNone(minimumAge) ||
      Duration.isLessThanOrEqualTo(minimumAge.value, Duration.zero)
    ) {
      return Option.none<string>();
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
    if (Option.isNone(index)) return Option.none<string>();

    const versionEntry = index.value.versions.find((entry) => entry.version === ref.version);
    if (versionEntry === undefined) return Option.none<string>();
    if (yield* isVersionEntryMature(versionEntry, minimumAge.value)) return Option.none<string>();

    return Option.some(
      `${ref.owner}/skills/${ref.name}@${ref.version} was published less than ${minimumReleaseAge} ago — installing it because you requested this version explicitly`,
    );
  }).pipe(Effect.catch(() => Effect.succeed(Option.none<string>())));

const targetChangeBeforeInstall = (args: {
  readonly linkPath: string;
  readonly canonicalSkillSrcPath: string;
}) =>
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
      return resolvedCurrentTarget === resolvedExpectedTarget ? "unchanged" : "updated";
    }
    const exists = yield* fs.exists(args.linkPath).pipe(Effect.catch(() => Effect.succeed(false)));
    return exists ? "updated" : "created";
  });

/** The closures a settled skill intent becomes. */
export const planSkillInstall: (
  intent: SkillInstallIntent,
) => Effect.Effect<
  Plan<InstallStepRequirements>,
  ExtensionLifecycleFailed,
  InstallStepRequirements | SkillManager | FileSystem.FileSystem | Path.Path | HttpClient.HttpClient
> = Effect.fn("InstallExtensions.planSkills")(function* (intent: SkillInstallIntent) {
  const ws = yield* WorkspaceMutations;
  const skillManager = yield* SkillManager;
  const agentRepo = yield* CodingAgentRepository;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const steps = yield* Effect.forEach(
    intent.skillsToInstall,
    (entry) =>
      Effect.gen(function* () {
        const ref = entry.ref;
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
        const sanitizedName = sanitizeName(ref.skill.name);
        const installableTargets = resolvedAgents.flatMap(
          ({ agentId, outcome }): ReadonlyArray<InstallableSkillTarget> =>
            outcome._tag === "supported"
              ? [{ agentId, targetDir: path.normalize(outcome.dir) }]
              : [],
        );
        const targetLocations = yield* groupInstallTargetsByDirectory(
          installableTargets,
          ws.baseDir,
        );
        const artifactAgents = artifactAgentIdsFromTargets(installableTargets);
        const targets = yield* Effect.forEach(
          targetLocations,
          (location) => {
            const linkPath = path.join(location.targetDir, sanitizedName);
            return targetChangeBeforeInstall({
              linkPath,
              canonicalSkillSrcPath: skillSrcPath,
            }).pipe(
              Effect.map((change) => {
                const agentIds = artifactTargetAgentIds(location.agentIds);
                return {
                  path: path.relative(ws.baseDir, linkPath),
                  change,
                  ...(agentIds.length > 0 ? { agentIds } : {}),
                } satisfies JobStepArtifactTarget;
              }),
            );
          },
          { concurrency: "unbounded" },
        );
        const firstTarget = targets[0];
        const rawDisplayPath =
          firstTarget === undefined ? path.relative(ws.baseDir, skillSrcPath) : firstTarget.path;
        const version = ref.refType === "registry" ? ref.version : undefined;

        const installedBefore = yield* skillManager
          .isInstalled({ target: { type: "skill", name: ref.skill.name } })
          .pipe(Effect.catch(() => Effect.succeed(false)));
        const releaseAgeWarning = yield* brandNewReleaseAgeWarning(ref, installedBefore);

        return withPlanWarning(
          buildInstallOperation(skillManager, {
            toStepFailure: lifecycleStepFailure,
            ref,
            declaration: { name: ref.skill.name, versionRange: entry.versionRange },
            force: intent.force === true,
            installedBefore: Effect.succeed(installedBefore),
            buildArtifact: ({ installedBefore }) =>
              Effect.gen(function* () {
                const fileCount = yield* countFiles(fs, path, skillSrcPath);
                const currentSourceHash = yield* computeSkillSourceHash(skillSrcPath);
                const sameVersion = previousVersion === version;
                const sameSource = sourceHashBeforeInstall === currentSourceHash;
                const fallbackChange: JobStepArtifact["change"] = !installedBefore
                  ? "created"
                  : sameVersion && sameSource
                    ? "unchanged"
                    : "updated";
                const artifactChange = artifactChangeFromTargets(fallbackChange, targets);
                const sourceDetails = gitHostedSkillArtifactSource(ref);
                return {
                  path: rawDisplayPath.length === 0 ? "." : rawDisplayPath,
                  scope: ws.scope,
                  agents: artifactAgents,
                  ...(version !== undefined ? { version } : {}),
                  change: artifactChange,
                  ...(previousVersion !== undefined && previousVersion !== version
                    ? { previousVersion }
                    : {}),
                  fileCount,
                  ...(targets.length > 0 ? { targets } : {}),
                  ...(sourceDetails !== undefined ? { source: sourceDetails } : {}),
                } satisfies JobStepArtifact;
              }),
          }),
          releaseAgeWarning,
        );
      }).pipe(
        Effect.mapError((cause) =>
          installRefused({
            category: "internal",
            detail: `Skill install planning failed for ${entry.ref.skill.name}`,
            cause,
          }),
        ),
      ),
    { concurrency: 1 },
  );

  return {
    _tag: "Plan",
    name:
      intent.skillsToInstall.length === 0
        ? "Install skills"
        : intent.skillsToInstall.length === 1
          ? "Install skill"
          : `Install ${intent.skillsToInstall.length} skills`,
    description: Option.none(),
    presentation: operationPresentation(
      { imperative: "install", past: "Installed", gerund: "Installing" },
      "skill",
    ),
    jobs: [{ concurrency: 1, steps }],
  } satisfies Plan<InstallStepRequirements>;
});
