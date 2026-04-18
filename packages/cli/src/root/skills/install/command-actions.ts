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
import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Terminal from "effect/Terminal";
import { nonInteractiveFlag } from "@agentxm/client-core/unstable/cli-flags";
import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import type { Handle } from "@agentxm/client-core/unstable/extensions";
import type { VersionConstraint } from "@agentxm/client-core/unstable/version-constraints";
import { parseInputPattern } from "@agentxm/client-core/unstable/sources";
import type { Source, InputParseResult } from "@agentxm/client-core/unstable/sources";
import { SourceHostProviders } from "@agentxm/client-core/unstable/source-resolution";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { Workspace } from "@agentxm/client-core/unstable/workspace";
import { SkillManager, type SkillExtensionRef } from "@agentxm/client-core/unstable/skills";
import { buildInstallOperation } from "@agentxm/client-core/unstable/extensions";
import type { InstallExtensionCommandWorkflowActions } from "@agentxm/client-core/unstable/workflows";
import type { Plan, PlanSection } from "@agentxm/client-core/unstable/workspace";
import {
  formatPackageDisplay,
  PackageUrlPartsSchema,
  type PackageUrlParts,
} from "@agentxm/client-core/unstable/packaging";
import type { InstallSkillCommandIntent } from "./intent.js";
import {
  resolveSkillInstallSource,
  type RegistryLookupProbe,
} from "./resolve-skill-install-source.js";
import { determineSkillsToInstall } from "./select-skills.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface InstallSkillSourceHandlerArgs {
  readonly source: string;
  readonly skills: readonly string[];
  readonly all: boolean;
}

/**
 * Parsed and validated skill install arguments.
 */
export interface ParsedSkillInstallArgs {
  readonly source: Source;
  readonly versionConstraint: Option.Option<VersionConstraint>;
  readonly requestedSkills: ReadonlyArray<string>;
  readonly requestedOwner: Option.Option<Handle>;
  readonly all: boolean;
}

/**
 * Source request for skill install discovery.
 */
export interface SkillSourceRequest {
  readonly source: Source;
  readonly requestedSkills: ReadonlyArray<string>;
  readonly requestedOwner: Option.Option<Handle>;
  readonly versionConstraint: Option.Option<VersionConstraint>;
}

// -----------------------------------------------------------------------------
// Helpers (pure, no service dependencies)
// -----------------------------------------------------------------------------

const isAppErrorCheck = (error: unknown): error is AppError =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  error._tag === "AppError" &&
  "what" in error &&
  "code" in error;

const summarizeDiscoverError = (error: unknown): string => {
  if (isAppErrorCheck(error)) {
    return `${error.what} (${error.code})`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const isRemoteReadNotImplemented = (error: unknown): boolean =>
  isAppErrorCheck(error) &&
  (error.code === "REGISTRY_REMOTE_NOT_SUPPORTED" ||
    (error.code.startsWith("REGISTRY_REMOTE_") && error.code.endsWith("_NOT_IMPLEMENTED")));

const discoverHowToFix = (source: Source, error: unknown): string => {
  if (source.type === "registry") {
    if (isRemoteReadNotImplemented(error)) {
      return "Remote registry discovery is not yet supported for HTTP(S) sources. Use a file:// registry source, or install from github:owner/repo.";
    }
    return "Verify the configured registry is reachable and contains the requested owner/skill.";
  }
  if (source.type === "local") {
    return "Verify the source path contains directories with SKILL.md files.";
  }
  return "Verify the source is reachable and contains valid skill directories.";
};

const noSkillsFoundHowToFix = (source: Source): string => {
  if (source.type === "registry") {
    return "Verify the owner and skill name exist in the configured registry.";
  }
  if (source.type === "local") {
    return "Verify the source path contains directories with SKILL.md files.";
  }
  return "Verify the source contains skill directories with SKILL.md files.";
};

const formatRegistryProbe = (probe: RegistryLookupProbe): string => {
  switch (probe.outcome) {
    case "matched":
      return `${probe.location}: matched`;
    case "not-found":
      return `${probe.location}: no match`;
    case "error":
      return Option.match(probe.reason, {
        onNone: () => `${probe.location}: error`,
        onSome: (reason) => `${probe.location}: ${reason}`,
      });
  }
};

const decodePackageUrlParts = Schema.decodeUnknownResult(Schema.toType(PackageUrlPartsSchema));

/**
 * Extract compatible packages from a skill ref.
 *
 * Registry refs have a typed `compatiblePackages` field.
 * Local/git-hosted refs may carry them in the generic `metadata` bag.
 *
 * @internal Exported for testing only.
 */
export const getCompatiblePackages = (ref: SkillExtensionRef): ReadonlyArray<PackageUrlParts> => {
  if (ref.refType === "registry") {
    return ref.compatiblePackages ?? [];
  }

  // For non-registry refs, check the generic metadata bag
  return Option.match(ref.skill.metadata, {
    onNone: (): ReadonlyArray<PackageUrlParts> => [],
    onSome: (m) => {
      const raw = m["compatiblePackages"];
      if (!globalThis.Array.isArray(raw)) return [];
      // Validate each entry individually — skip invalid ones rather than failing the whole array
      return raw.flatMap((entry: unknown) => {
        const decoded = decodePackageUrlParts(entry);
        return Result.isSuccess(decoded) ? [decoded.success] : [];
      });
    },
  });
};

/**
 * Build the "Compatible packages" plan section from skill refs.
 * Returns undefined when no skill has compatible packages.
 *
 * @internal Exported for testing only.
 */
export const buildCompatiblePackagesSection = (
  refs: ReadonlyArray<SkillExtensionRef>,
): PlanSection | undefined => {
  const allPackages = refs.flatMap((ref) => getCompatiblePackages(ref));
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

export class InstallSkillCommandWorkflowActions extends ServiceMap.Service<
  InstallSkillCommandWorkflowActions,
  InstallExtensionCommandWorkflowActions<
    SkillsInstallHandlerArgs,
    ParsedSkillInstallArgs,
    SkillSourceRequest,
    SkillExtensionRef,
    InstallSkillCommandIntent
  >
>()("InstallSkillCommandWorkflowActions") {}

// -----------------------------------------------------------------------------
// Live Layer
// -----------------------------------------------------------------------------

/**
 * Constructs the actions by resolving all services at layer-build time.
 * Each action method closes over the captured services so `R = never`.
 */
export const InstallSkillCommandWorkflowActionsLive = Layer.effect(
  InstallSkillCommandWorkflowActions,
  Effect.gen(function* () {
    const sources = yield* SourceHostProviders;
    const renderer = yield* CliRenderer;
    const skillMgr = yield* SkillManager;
    const ws = yield* Workspace;
    const pathSvc = yield* Path.Path;
    const fsSvc = yield* FileSystem.FileSystem;
    const terminal = yield* Terminal.Terminal;
    const nonInteractive = yield* nonInteractiveFlag;

    // Build a service layer providing all services needed by inner effects
    // (resolveSkillInstallSource, determineSkillsToInstall, etc.)
    const envLayer = Layer.mergeAll(
      Layer.succeed(SourceHostProviders, sources),
      Layer.succeed(CliRenderer, renderer),
      Layer.succeed(Workspace, ws),
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
          yield* renderer.info(`axm skills install (${ws.scope})`);

          const parsed = yield* renderer.withSpinner(
            "Parsing source...",
            () =>
              Effect.gen(function* () {
                const parsedSourceOption = parseInputPattern(args.source.trim());
                if (Option.isNone(parsedSourceOption)) {
                  return yield* makeAppError({
                    code: "INVALID_SOURCE",
                    what: "Invalid source: Unable to parse source",
                    details: [`Provided: ${args.source || "(empty)"}`],
                    howToFix:
                      "Valid formats: local path, github:owner/repo, gitlab:owner/repo, or https://example.com",
                  });
                }

                const parsedSource = parsedSourceOption.value;
                const versionConstraint =
                  parsedSource.pattern.pattern === "registry-pattern-input"
                    ? parsedSource.pattern.versionConstraint
                    : Option.none<VersionConstraint>();

                const resolutionProbes: RegistryLookupProbe[] = [];
                const source = yield* resolveSkillInstallSource(parsedSource, {
                  onRegistryProbe: (probe) => {
                    resolutionProbes.push(probe);
                  },
                });

                const requestedSkills = extractRequestedSkills(args.skills, parsedSource);
                const requestedOwner = extractRequestedOwner(parsedSource, source);

                return {
                  source,
                  versionConstraint,
                  requestedSkills,
                  requestedOwner,
                  resolutionProbes,
                };
              }),
            {
              successMessage: ({ source }) => `Source: ${sources.origin(source)} (${source.type})`,
            },
          );

          const { source, versionConstraint, requestedSkills, requestedOwner, resolutionProbes } =
            parsed;

          if (resolutionProbes.length > 0) {
            yield* renderer.message(
              `Resolution: ${resolutionProbes.map((probe) => formatRegistryProbe(probe)).join("; ")}`,
            );
          }

          return {
            source,
            versionConstraint,
            requestedSkills,
            requestedOwner,
            all: args.all,
          } satisfies ParsedSkillInstallArgs;
        }),
      );

    const resolveSourceRequests = (parsed: ParsedSkillInstallArgs) =>
      Effect.succeed<ReadonlyArray<SkillSourceRequest>>([
        {
          source: parsed.source,
          requestedSkills: parsed.requestedSkills,
          requestedOwner: parsed.requestedOwner,
          versionConstraint: parsed.versionConstraint,
        },
      ]);

    const discoverRefs = (reqs: ReadonlyArray<SkillSourceRequest>) =>
      provide(
        Effect.scoped(
          Effect.gen(function* () {
            const req = reqs[0];
            if (req === undefined) {
              return yield* makeAppError({
                code: "DISCOVER_FAILED",
                what: "No source request to discover from",
              });
            }

            return yield* renderer.withSpinner(
              "Discovering skills...",
              () =>
                sources
                  .find(req.source, {
                    names: req.requestedSkills,
                    type: "skill" as const,
                    owner: req.requestedOwner,
                    versionConstraint: req.versionConstraint,
                  })
                  .pipe(
                    Effect.map(
                      Array.filter((ref): ref is SkillExtensionRef => ref.type === "skill"),
                    ),
                    Effect.mapError((error) => {
                      const reason = summarizeDiscoverError(error);
                      return makeAppError({
                        code: "DISCOVER_FAILED",
                        what: "Failed to discover skills from source",
                        details: [`Source: ${sources.origin(req.source)}`, `Reason: ${reason}`],
                        howToFix: discoverHowToFix(req.source, error),
                        cause: error,
                      });
                    }),
                    Effect.flatMap((discoveredSkills) =>
                      !Array.isReadonlyArrayEmpty(discoveredSkills)
                        ? Effect.succeed(discoveredSkills)
                        : Effect.fail(
                            makeAppError({
                              code: "NO_SKILLS_FOUND",
                              what: "No skills found in source",
                              details: [`Source: ${sources.origin(req.source)}`],
                              howToFix: noSkillsFoundHowToFix(req.source),
                            }),
                          ),
                    ),
                  ),
              {
                successMessage: (discoveredSkills) => `Found ${discoveredSkills.length} skill(s)`,
              },
            );
          }),
        ),
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
              code: "NO_SKILLS_FOUND",
              what: "No skills found in source",
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
            yield* renderer.warn("No skills selected.");
            yield* renderer.success("Nothing to install.");
            return { skillsToInstall: [] } satisfies InstallSkillCommandIntent;
          }

          return {
            skillsToInstall: selectedSkills.map((ref) => ({
              ref,
              versionConstraint:
                ref.refType === "registry"
                  ? parsed.versionConstraint
                  : Option.none<VersionConstraint>(),
            })),
          } satisfies InstallSkillCommandIntent;
        }),
      );

    const buildPlan = (intent: InstallSkillCommandIntent) => {
      const compatSection = buildCompatiblePackagesSection(
        intent.skillsToInstall.map((entry) => entry.ref),
      );
      const sections = compatSection !== undefined ? [compatSection] : undefined;

      return Effect.succeed<Plan>({
        _tag: "Plan",
        name: "Install skill(s)",
        description: Option.none(),
        jobs: [
          {
            concurrency: 1 as const,
            steps: intent.skillsToInstall.map((entry) =>
              buildInstallOperation(skillMgr, {
                ref: entry.ref,
                versionConstraint: entry.versionConstraint,
              }),
            ),
          },
        ],
        ...(sections !== undefined && { sections }),
      } satisfies Plan);
    };

    return {
      parseArgs,
      resolveSourceRequests,
      discoverRefs,
      finalizeIntent,
      buildPlan,
    };
  }),
);
