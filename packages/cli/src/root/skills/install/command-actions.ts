/**
 * Skill install command workflow actions.
 *
 * Implements `InstallExtensionCommandWorkflowActions` for the skill install
 * command. The live layer captures all required services at construction time
 * so action methods satisfy the `R = never` contract.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Array from "effect/Array";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Terminal from "effect/Terminal";
import * as HttpClient from "effect/unstable/http/HttpClient";
import { nonInteractiveFlag, Verbosity } from "@agentxm/extension-management/unstable/cli-flags";
import { makeAppError, type AppError } from "@agentxm/extension-management/unstable/app-error";
import type { Handle } from "@agentxm/extension-model/unstable/extensions";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import { parseInputPattern } from "@agentxm/extension-model/unstable/sources/parser";
import type { Source } from "@agentxm/extension-model/unstable/sources/types";
import type { InputParseResult } from "@agentxm/extension-model/unstable/sources/parser";
import { SourceHostProviders, WorkspaceCatalog } from "@agentxm/extension-sources";
import { createRegistryClient } from "@agentxm/registry-client";
import {
  isVersionEntryMature,
  parseMinimumReleaseAge,
} from "@agentxm/registry-protocol/unstable/registry/release-age-policy";
import { CliRenderer, count } from "@agentxm/extension-management/unstable/cli-renderer";
import { WorkspaceMutations, type SkillPathSource, sanitizeName } from "@agentxm/workspace-state";
import { type SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import {
  computeSkillSourceHash,
  gitHostedSkillArtifactSource,
  groupInstallTargetsByDirectory,
  type InstallableSkillTarget,
  SkillManager,
} from "@agentxm/extension-management/unstable/skills";
import { buildInstallOperation } from "@agentxm/extension-management/unstable/extensions";
import { matchesReleaseAgeExcludePattern } from "@agentxm/extension-model/unstable/extensions";
import { CodingAgentRepository } from "@agentxm/extension-workspace";
import type { InstallExtensionCommandWorkflowActions } from "@agentxm/extension-management/unstable/extension-lifecycle";
import type { JobStepArtifact, JobStepArtifactTarget } from "@agentxm/workspace-operations";
import {
  operationPresentation,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import {
  formatPackageDisplay,
  PackageUrlPartsSchema,
  type PackageUrlParts,
} from "@agentxm/extension-model/unstable/packaging";
import type { InstallSkillCommandIntent } from "./intent.js";
import { resolveSkillInstallSource } from "./resolve-skill-install-source.js";
import {
  formatRegistryProbe,
  type RegistryLookupProbe,
} from "../../shared/install-source-resolution.js";
import { determineSkillsToInstall } from "./select-skills.js";
import { toAppError } from "@agentxm/extension-management/unstable/app-error/conversions";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface InstallSkillSourceHandlerArgs {
  readonly source: string;
  readonly skills: readonly string[];
  readonly all: boolean;
  /** Re-materialize even when the canonical tree already matches the lockfile. */
  readonly force?: boolean;
}

/**
 * Parsed and validated skill install arguments.
 */
export interface ParsedSkillInstallArgs {
  readonly source: Source;
  readonly versionRange: Option.Option<VersionRange>;
  readonly requestedSkills: ReadonlyArray<string>;
  readonly requestedOwner: Option.Option<Handle>;
  readonly resolutionProbes: ReadonlyArray<RegistryLookupProbe>;
  readonly all: boolean;
  readonly force: boolean;
}

/**
 * Source request for skill install discovery.
 */
export interface SkillSourceRequest {
  readonly source: Source;
  readonly requestedSkills: ReadonlyArray<string>;
  readonly requestedOwner: Option.Option<Handle>;
  readonly versionRange: Option.Option<VersionRange>;
}

// -----------------------------------------------------------------------------
// Helpers (pure, no service dependencies)
// -----------------------------------------------------------------------------

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
  if (!("resolvedVersion" in entry) || typeof entry.resolvedVersion !== "string") {
    return undefined;
  }
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

const UNIVERSAL_AGENT_ID = "universal";

const artifactAgentIdsFromTargets = (
  targets: ReadonlyArray<InstallableSkillTarget>,
): ReadonlyArray<string> =>
  Array.dedupe(
    targets.map((target) => target.agentId).filter((agentId) => agentId !== UNIVERSAL_AGENT_ID),
  );

const artifactTargetAgentIds = (
  agentIds: ReadonlyArray<InstallableSkillTarget["agentId"]>,
): ReadonlyArray<string> => agentIds.filter((agentId) => agentId !== UNIVERSAL_AGENT_ID);

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

const withPlanWarning = (step: PlannedJobStep, warning: Option.Option<string>): PlannedJobStep => {
  if (Option.isNone(warning) || step.readiness === "error") return step;

  if (step.readiness === "warn") {
    return {
      ...step,
      run: step.run.pipe(Effect.map(appendWarningToResult(warning.value))),
    };
  }

  return {
    ...step,
    message: warning.value,
    run: step.run.pipe(Effect.map(appendWarningToResult(warning.value))),
  };
};

/**
 * Extract compatible packages from a skill ref.
 *
 * Registry refs have a typed `packages` field.
 * Local/git-hosted refs may carry them in the generic `metadata` bag.
 *
 * @internal Exported for testing only.
 */
export const getCompanionPackages = (ref: SkillExtensionRef): ReadonlyArray<PackageUrlParts> => {
  if (ref.refType === "registry") {
    return ref.packages ?? [];
  }

  // For non-registry refs, check the generic metadata bag
  return Option.match(ref.skill.metadata, {
    onNone: (): ReadonlyArray<PackageUrlParts> => [],
    onSome: (m) => {
      const raw = m["packages"];
      if (!globalThis.Array.isArray(raw)) return [];
      // Validate each entry individually — skip invalid ones rather than failing the whole array
      return raw.flatMap((entry: unknown) => {
        const decoded = decodePackageUrlParts(entry);
        return Result.isSuccess(decoded) ? [decoded.success] : [];
      });
    },
  });
};

/** Companion-package orientation rendered at planning time. */
export interface CompanionPackagesSection {
  readonly title: string;
  readonly items: ReadonlyArray<string>;
}

/**
 * Build the "Compatible packages" orientation block from skill refs.
 * Returns undefined when no skill has compatible packages.
 *
 * @internal Exported for testing only.
 */
export const buildCompanionPackagesSection = (
  refs: ReadonlyArray<SkillExtensionRef>,
): CompanionPackagesSection | undefined => {
  const allPackages = refs.flatMap((ref) => getCompanionPackages(ref));
  if (allPackages.length === 0) return undefined;

  // Deduplicate by formatted string
  const seen = new Set<string>();
  const items: string[] = [];
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
  argSkills: readonly string[],
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

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

type SkillsInstallHandlerArgs = InstallSkillSourceHandlerArgs;

type InstallSkillActions = InstallExtensionCommandWorkflowActions<
  SkillsInstallHandlerArgs,
  ParsedSkillInstallArgs,
  SkillSourceRequest,
  SkillExtensionRef,
  InstallSkillCommandIntent
>;

export const InstallSkillCommandWorkflowActions = Effect.gen(function* () {
  const sources = yield* SourceHostProviders;
  const catalog = yield* WorkspaceCatalog;
  const httpClient = yield* HttpClient.HttpClient;
  const renderer = yield* CliRenderer;
  const skillMgr = yield* SkillManager;
  const ws = yield* WorkspaceMutations;
  const pathSvc = yield* Path.Path;
  const fsSvc = yield* FileSystem.FileSystem;
  const terminal = yield* Terminal.Terminal;
  const nonInteractive = yield* nonInteractiveFlag;
  const verbosityOption = yield* Effect.serviceOption(Verbosity);
  const agentRepo = yield* CodingAgentRepository;
  const verbose = Option.match(verbosityOption, {
    onNone: () => false,
    onSome: (verbosity) => verbosity.isAtLeast("verbose"),
  });
  const computeExistingSourceHash = (ref: SkillExtensionRef) =>
    Effect.gen(function* () {
      const { skillSrcPath } = yield* ws
        .getSkillDir(ref.skill.name, skillPathSourceFor(ref))
        .pipe(Effect.mapError(toAppError));
      const exists = yield* fsSvc
        .exists(skillSrcPath)
        .pipe(Effect.catch(() => Effect.succeed(false)));
      if (!exists) return undefined;
      return yield* computeSkillSourceHash(skillSrcPath).pipe(
        Effect.mapError(toAppError),
        Effect.provideService(FileSystem.FileSystem, fsSvc),
        Effect.provideService(Path.Path, pathSvc),
      );
    });

  const brandNewReleaseAgeWarning = (ref: SkillExtensionRef, installedBefore: boolean) =>
    Effect.gen(function* () {
      if (installedBefore || ref.refType !== "registry") return Option.none<string>();

      const excluded = (yield* ws
        .getMinimumReleaseAgeExclude()
        .pipe(Effect.mapError(toAppError))).some(({ pattern }) =>
        matchesReleaseAgeExcludePattern(pattern, {
          owner: ref.owner,
          type: "skill",
          name: ref.name,
        }),
      );
      if (excluded) return Option.none<string>();

      const minimumReleaseAge = yield* ws.getMinimumReleaseAge().pipe(Effect.mapError(toAppError));
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
      if (yield* isVersionEntryMature(versionEntry, minimumAge.value)) {
        return Option.none<string>();
      }

      return Option.some(
        `${ref.owner}/skills/${ref.name}@${ref.version} was published less than ${minimumReleaseAge} ago — installing it because you requested this version explicitly`,
      );
    }).pipe(Effect.catch(() => Effect.succeed(Option.none<string>())));

  const targetChangeBeforeInstall = ({
    linkPath,
    canonicalSkillSrcPath,
  }: {
    readonly linkPath: string;
    readonly canonicalSkillSrcPath: string;
  }) =>
    Effect.gen(function* () {
      const linkTarget = yield* fsSvc.readLink(linkPath).pipe(Effect.option);
      if (Option.isSome(linkTarget)) {
        const currentAbsoluteTarget = pathSvc.resolve(pathSvc.dirname(linkPath), linkTarget.value);
        const resolvedCurrentTarget = yield* fsSvc
          .realPath(currentAbsoluteTarget)
          .pipe(Effect.catch(() => Effect.succeed(currentAbsoluteTarget)));
        const resolvedExpectedTarget = yield* fsSvc
          .realPath(canonicalSkillSrcPath)
          .pipe(Effect.catch(() => Effect.succeed(canonicalSkillSrcPath)));
        return resolvedCurrentTarget === resolvedExpectedTarget ? "unchanged" : "updated";
      }

      const exists = yield* fsSvc.exists(linkPath).pipe(Effect.catch(() => Effect.succeed(false)));
      return exists ? "updated" : "created";
    });

  // Build a service layer providing all services needed by inner effects
  // (resolveSkillInstallSource, determineSkillsToInstall, etc.)
  const envLayer = Layer.mergeAll(
    Layer.succeed(SourceHostProviders, sources),
    Layer.succeed(WorkspaceCatalog, catalog),
    Layer.succeed(HttpClient.HttpClient, httpClient),
    Layer.succeed(CliRenderer, renderer),
    Layer.succeed(WorkspaceMutations, ws),
    Layer.succeed(Path.Path, pathSvc),
    Layer.succeed(FileSystem.FileSystem, fsSvc),
    Layer.succeed(Terminal.Terminal, terminal),
    Layer.succeed(nonInteractiveFlag, nonInteractive),
  );

  // Provide all captured services so workflow methods close over their
  // dependencies while PromptCancelled still propagates to the runtime.
  const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provide(effect, envLayer);

  // PromptCancelled from prompts propagates through the workflow
  // to the run() handler. The provide() helper narrows E to AppError for the interface.
  const parseArgs = (args: SkillsInstallHandlerArgs) =>
    provide(
      Effect.gen(function* () {
        const parseSource = Effect.gen(function* () {
          const parsedSourceOption = parseInputPattern(args.source.trim());
          if (Option.isNone(parsedSourceOption)) {
            return yield* makeAppError({
              code: "validation",
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

          const resolutionProbes: RegistryLookupProbe[] = [];
          const source = yield* resolveSkillInstallSource(parsedSource, {
            onRegistryProbe: (probe) => {
              resolutionProbes.push(probe);
            },
          }).pipe(Effect.mapError(toAppError));

          const requestedSkills = extractRequestedSkills(args.skills, parsedSource);
          const requestedOwner = extractRequestedOwner(parsedSource, source);

          return {
            source,
            versionRange,
            requestedSkills,
            requestedOwner,
            resolutionProbes,
          };
        });

        const parsed = yield* parseSource;

        const { source, versionRange, requestedSkills, requestedOwner, resolutionProbes } = parsed;

        return {
          source,
          versionRange,
          requestedSkills,
          requestedOwner,
          resolutionProbes,
          all: args.all,
          force: args.force === true,
        } satisfies ParsedSkillInstallArgs;
      }),
    );

  const resolveSourceRequests = (parsed: ParsedSkillInstallArgs) =>
    Effect.succeed<ReadonlyArray<SkillSourceRequest>>([
      {
        source: parsed.source,
        requestedSkills: parsed.requestedSkills,
        requestedOwner: parsed.requestedOwner,
        versionRange: parsed.versionRange,
      },
    ]);

  const discoverRefs = (reqs: ReadonlyArray<SkillSourceRequest>) =>
    provide(
      Effect.gen(function* () {
        const req = reqs[0];
        if (req === undefined) {
          return yield* makeAppError({
            code: "usage",
            detail: "No source request to discover from",
          });
        }

        const discover = sources
          .find(req.source, {
            names: req.source.type === "registry" ? req.requestedSkills : [],
            type: "skill" as const,
            owner: req.requestedOwner,
            versionRange: req.versionRange,
          })
          .pipe(
            Effect.mapError(toAppError),
            Effect.map(Array.filter((ref): ref is SkillExtensionRef => ref.type === "skill")),
            Effect.flatMap((discoveredSkills) =>
              !Array.isReadonlyArrayEmpty(discoveredSkills)
                ? Effect.succeed(discoveredSkills)
                : Effect.fail(
                    makeAppError({
                      code: "not_found",
                      detail: "No skills found in source",
                      recover: noSkillsFoundHowToFix(req.source),
                    }),
                  ),
            ),
          );

        return yield* discover;
      }),
    );

  const finalizeIntent = (
    parsed: ParsedSkillInstallArgs,
    discoveredRefs: ReadonlyArray<SkillExtensionRef>,
  ) =>
    provide(
      Effect.gen(function* () {
        // Select skills
        const [firstDiscoveredRef, ...remainingDiscoveredRefs] = discoveredRefs;
        if (firstDiscoveredRef === undefined) {
          return yield* makeAppError({
            code: "not_found",
            detail: "No skills found in source",
          });
        }
        const nonEmptyDiscoveredRefs: Array.NonEmptyReadonlyArray<SkillExtensionRef> = [
          firstDiscoveredRef,
          ...remainingDiscoveredRefs,
        ];
        const selectedSkills = yield* determineSkillsToInstall(nonEmptyDiscoveredRefs, {
          requestedSkills: parsed.requestedSkills,
          all: parsed.all,
        });

        if (Array.isReadonlyArrayEmpty(selectedSkills)) {
          return { skillsToInstall: [] } satisfies InstallSkillCommandIntent;
        }

        if (verbose) {
          const diagnosticLines = [
            `Source: ${sources.origin(parsed.source)} (${parsed.source.type})`,
            ...(parsed.resolutionProbes.length > 0
              ? [
                  `Resolution: ${parsed.resolutionProbes.map((probe) => formatRegistryProbe(probe)).join("; ")}`,
                ]
              : []),
            `Found ${count(discoveredRefs.length, "skill")}`,
          ];
          for (const line of diagnosticLines) {
            yield* renderer.info(line);
          }
        }

        return {
          skillsToInstall: selectedSkills.map((ref) => ({
            ref,
            versionRange:
              ref.refType === "registry" ? parsed.versionRange : Option.none<VersionRange>(),
          })),
          force: parsed.force,
        } satisfies InstallSkillCommandIntent;
      }),
    );

  const buildPlan = (intent: InstallSkillCommandIntent) =>
    Effect.gen(function* () {
      const compatSection = buildCompanionPackagesSection(
        intent.skillsToInstall.map((entry) => entry.ref),
      );
      if (compatSection !== undefined) {
        yield* renderer.info(`${compatSection.title}:`);
        for (const item of compatSection.items) {
          yield* renderer.info(`  ${item}`);
        }
      }
      const steps = yield* Effect.forEach(
        intent.skillsToInstall,
        (entry) =>
          Effect.gen(function* () {
            const ref = entry.ref;
            const previousLockEntry = yield* ws
              .getLockedSkill(ref.skill.name)
              .pipe(Effect.mapError(toAppError))
              .pipe(Effect.catch(() => Effect.succeed(Option.none())));
            const previousVersion = Option.match(previousLockEntry, {
              onNone: () => undefined,
              onSome: previousResolvedVersion,
            });
            const sourceHashBeforeInstall =
              Option.match(previousLockEntry, {
                onNone: () => undefined,
                onSome: previousSourceHash,
              }) ?? (yield* computeExistingSourceHash(ref));
            const configuredAgents = yield* agentRepo
              .getMaterializationAgents()
              .pipe(Effect.mapError(toAppError), Effect.provideService(WorkspaceMutations, ws));
            const resolvedAgents = yield* Effect.forEach(
              configuredAgents,
              (agent) =>
                agent.resolveEffectiveSkillsDir({ workspaceRoot: ws.baseDir }).pipe(
                  Effect.mapError(toAppError),
                  Effect.provideService(FileSystem.FileSystem, fsSvc),
                  Effect.provideService(Path.Path, pathSvc),
                  Effect.map((outcome) => ({ agentId: agent.id, outcome })),
                ),
              { concurrency: "unbounded" },
            );
            const { skillSrcPath } = yield* ws
              .getSkillDir(ref.skill.name, skillPathSourceFor(ref))
              .pipe(Effect.mapError(toAppError));
            const sanitizedName = sanitizeName(ref.skill.name);
            const installableTargets = resolvedAgents.flatMap(
              ({ agentId, outcome }): ReadonlyArray<InstallableSkillTarget> =>
                outcome._tag === "supported"
                  ? [{ agentId, targetDir: pathSvc.normalize(outcome.dir) }]
                  : [],
            );
            const targetLocations = yield* groupInstallTargetsByDirectory(
              installableTargets,
              ws.baseDir,
            ).pipe(
              Effect.provideService(FileSystem.FileSystem, fsSvc),
              Effect.provideService(Path.Path, pathSvc),
            );
            const artifactAgents = artifactAgentIdsFromTargets(installableTargets);
            const targets = yield* Effect.forEach(
              targetLocations,
              (location) => {
                const linkPath = pathSvc.join(location.targetDir, sanitizedName);
                return targetChangeBeforeInstall({
                  linkPath,
                  canonicalSkillSrcPath: skillSrcPath,
                }).pipe(
                  Effect.map((change) => {
                    const agentIds = artifactTargetAgentIds(location.agentIds);
                    return {
                      path: pathSvc.relative(ws.baseDir, linkPath),
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
              firstTarget === undefined
                ? pathSvc.relative(ws.baseDir, skillSrcPath)
                : firstTarget.path;
            const version = ref.refType === "registry" ? ref.version : undefined;
            const buildArtifact = ({
              installedBefore,
            }: {
              readonly installedBefore: boolean;
            }): Effect.Effect<JobStepArtifact, AppError> =>
              Effect.gen(function* () {
                const fileCount = yield* countFiles(fsSvc, pathSvc, skillSrcPath);
                const currentSourceHash = yield* computeSkillSourceHash(skillSrcPath).pipe(
                  Effect.mapError(toAppError),
                  Effect.provideService(FileSystem.FileSystem, fsSvc),
                  Effect.provideService(Path.Path, pathSvc),
                );
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
              });

            const installedBefore = yield* skillMgr
              .isInstalled({ target: { type: "skill", name: ref.skill.name } })
              .pipe(Effect.catch(() => Effect.succeed(false)));
            const releaseAgeWarning = yield* brandNewReleaseAgeWarning(ref, installedBefore).pipe(
              Effect.provideService(FileSystem.FileSystem, fsSvc),
              Effect.provideService(Path.Path, pathSvc),
              Effect.provideService(HttpClient.HttpClient, httpClient),
            );

            return withPlanWarning(
              buildInstallOperation(skillMgr, {
                ref,
                versionRange: entry.versionRange,
                force: intent.force === true,
                installedBefore: Effect.succeed(installedBefore),
                buildArtifact,
              }),
              releaseAgeWarning,
            );
          }),
        { concurrency: 1 },
      );

      return {
        _tag: "Plan",
        name:
          intent.skillsToInstall.length === 0
            ? "Install skills"
            : intent.skillsToInstall.length === 1
              ? "Install skill"
              : `Install ${count(intent.skillsToInstall.length, "skill")}`,
        description: Option.none(),
        presentation: operationPresentation(
          { imperative: "install", past: "Installed", gerund: "Installing" },
          "skill",
        ),
        jobs: [
          {
            concurrency: 1 as const,
            steps,
          },
        ],
      } satisfies Plan;
    });

  return {
    parseArgs,
    resolveSourceRequests,
    discoverRefs,
    finalizeIntent,
    buildPlan,
  };
}).pipe(Effect.map((actions): InstallSkillActions => actions));
