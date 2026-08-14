/**
 * Subagent install command workflow actions.
 *
 * Implements `InstallExtensionCommandWorkflowActions` for the subagent install
 * command. The live layer captures all required services at construction time
 * so action methods satisfy the `R = never` contract.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Array from "effect/Array";
import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Terminal from "effect/Terminal";
import { nonInteractiveFlag, Verbosity } from "@agentxm/client-core/unstable/cli-flags";
import { CodingAgentRepository } from "@agentxm/client-core/unstable/agents";
import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import type { Handle } from "@agentxm/client-core/unstable/extensions";
import type { VersionRange } from "@agentxm/client-core/unstable/version-constraints";
import { parseInputPattern } from "@agentxm/client-core/unstable/sources";
import type { Source, InputParseResult } from "@agentxm/client-core/unstable/sources";
import { SourceHostProviders } from "@agentxm/client-core/unstable/source-resolution";
import { CliRenderer, count } from "@agentxm/client-core/unstable/cli-renderer";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import {
  SubagentManager,
  type SubagentExtensionRef,
} from "@agentxm/client-core/unstable/subagents";
import { buildInstallOperation } from "@agentxm/client-core/unstable/extensions";
import type { InstallExtensionCommandWorkflowActions } from "@agentxm/client-core/unstable/workflows";
import type { JobStepArtifact, Plan } from "@agentxm/client-core/unstable/plan";
import type { InstallSubagentCommandIntent } from "./intent.js";
import {
  resolveSubagentInstallSource,
  type RegistryLookupProbe,
} from "./resolve-subagent-install-source.js";
import { determineSubagentsToInstall } from "./select-subagents.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface InstallSubagentSourceHandlerArgs {
  readonly source: string;
  readonly subagents: readonly string[];
  readonly all: boolean;
}

/**
 * Parsed and validated subagent install arguments.
 */
export interface ParsedSubagentInstallArgs {
  readonly source: Source;
  readonly versionRange: Option.Option<VersionRange>;
  readonly requestedSubagents: ReadonlyArray<string>;
  readonly requestedOwner: Option.Option<Handle>;
  readonly resolutionProbes: ReadonlyArray<RegistryLookupProbe>;
  readonly all: boolean;
}

/**
 * Source request for subagent install discovery.
 */
export interface SubagentSourceRequest {
  readonly source: Source;
  readonly requestedSubagents: ReadonlyArray<string>;
  readonly requestedOwner: Option.Option<Handle>;
  readonly versionRange: Option.Option<VersionRange>;
}

// -----------------------------------------------------------------------------
// Helpers (pure, no service dependencies)
// -----------------------------------------------------------------------------

const isAppErrorCheck = (error: unknown): error is AppError =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  error._tag === "AppError" &&
  "detail" in error &&
  "code" in error;

const isRemoteReadNotImplemented = (error: unknown): boolean =>
  isAppErrorCheck(error) && error.detail.includes("not implemented");

const discoverHowToFix = (source: Source, error: unknown): string => {
  if (source.type === "registry") {
    if (isRemoteReadNotImplemented(error)) {
      return "Remote registry discovery is not yet supported for HTTP(S) sources. Use a file:// registry source, or install from github:owner/repo.";
    }
    return "Verify the configured registry is reachable and contains the requested owner/subagent.";
  }
  if (source.type === "local") {
    return "Verify the source path contains subagent directories with <name>.md files.";
  }
  return "Verify the source is reachable and contains valid subagent directories.";
};

const noSubagentsFoundHowToFix = (source: Source): string => {
  if (source.type === "registry") {
    return "Verify the owner and subagent name exist in the configured registry.";
  }
  if (source.type === "local") {
    return "Verify the source path contains subagent directories with <name>.md files.";
  }
  return "Verify the source contains subagent directories with <name>.md files.";
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

const extractRequestedSubagents = (
  argSubagents: readonly string[],
  parsedSource: InputParseResult,
): ReadonlyArray<string> =>
  argSubagents.length > 0
    ? argSubagents
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
  if (!("contentIdentity" in entry) || typeof entry.contentIdentity !== "string") return undefined;
  return entry.contentIdentity;
};

const artifactChange = (args: {
  readonly installedBefore: boolean;
  readonly previousVersion: string | undefined;
  readonly version: string | undefined;
  readonly previousSourceHash: string | undefined;
  readonly sourceHash: string | undefined;
}): JobStepArtifact["change"] => {
  if (!args.installedBefore) return "created";
  const sameVersion = args.previousVersion === args.version;
  const sameSource =
    args.previousSourceHash === undefined ||
    args.sourceHash === undefined ||
    args.previousSourceHash === args.sourceHash;
  return sameVersion && sameSource ? "unchanged" : "updated";
};

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

type SubagentsInstallHandlerArgs = InstallSubagentSourceHandlerArgs;

export class InstallSubagentCommandWorkflowActions extends ServiceMap.Service<
  InstallSubagentCommandWorkflowActions,
  InstallExtensionCommandWorkflowActions<
    SubagentsInstallHandlerArgs,
    ParsedSubagentInstallArgs,
    SubagentSourceRequest,
    SubagentExtensionRef,
    InstallSubagentCommandIntent
  >
>()("axm.sh/root/subagents/install/command-actions/InstallSubagentCommandWorkflowActions") {}

// -----------------------------------------------------------------------------
// Live Layer
// -----------------------------------------------------------------------------

/**
 * Constructs the actions by resolving all services at layer-build time.
 * Each action method closes over the captured services so `R = never`.
 */
export const InstallSubagentCommandWorkflowActionsLive = Layer.effect(
  InstallSubagentCommandWorkflowActions,
  Effect.gen(function* () {
    const sources = yield* SourceHostProviders;
    const renderer = yield* CliRenderer;
    const subagentMgr = yield* SubagentManager;
    const agentRepo = yield* CodingAgentRepository;
    const ws = yield* WorkspaceMutations;
    const pathSvc = yield* Path.Path;
    const fsSvc = yield* FileSystem.FileSystem;
    const terminal = yield* Terminal.Terminal;
    const nonInteractive = yield* nonInteractiveFlag;
    const verbosityOption = yield* Effect.serviceOption(Verbosity);
    const verbose = Option.match(verbosityOption, {
      onNone: () => false,
      onSome: (verbosity) => verbosity.isAtLeast("verbose"),
    });

    const envLayer = Layer.mergeAll(
      Layer.succeed(SourceHostProviders, sources),
      Layer.succeed(CliRenderer, renderer),
      Layer.succeed(WorkspaceMutations, ws),
      Layer.succeed(Path.Path, pathSvc),
      Layer.succeed(FileSystem.FileSystem, fsSvc),
      Layer.succeed(Terminal.Terminal, terminal),
      Layer.succeed(nonInteractiveFlag, nonInteractive),
    );

    const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provide(effect, envLayer);

    const parseArgs = (args: SubagentsInstallHandlerArgs) =>
      provide(
        Effect.gen(function* () {
          const parsedSourceOption = parseInputPattern(args.source.trim());
          if (Option.isNone(parsedSourceOption)) {
            return yield* makeAppError({
              code: "validation",
              detail: "Invalid source: Unable to parse source",
              suggestions: [
                {
                  description:
                    "Valid formats: local path, github:owner/repo, gitlab:owner/repo, or https://example.com",
                },
              ],
            });
          }

          const parsedSource = parsedSourceOption.value;
          const versionRange =
            parsedSource.pattern.pattern === "registry-pattern-input"
              ? parsedSource.pattern.versionRange
              : Option.none<VersionRange>();

          const resolutionProbes: RegistryLookupProbe[] = [];
          const source = yield* resolveSubagentInstallSource(parsedSource, {
            onRegistryProbe: (probe) => {
              resolutionProbes.push(probe);
            },
          });

          const requestedSubagents = extractRequestedSubagents(args.subagents, parsedSource);
          const requestedOwner = extractRequestedOwner(parsedSource, source);

          return {
            source,
            versionRange,
            requestedSubagents,
            requestedOwner,
            resolutionProbes,
            all: args.all,
          } satisfies ParsedSubagentInstallArgs;
        }),
      );

    const resolveSourceRequests = (parsed: ParsedSubagentInstallArgs) =>
      Effect.succeed<ReadonlyArray<SubagentSourceRequest>>([
        {
          source: parsed.source,
          requestedSubagents: parsed.requestedSubagents,
          requestedOwner: parsed.requestedOwner,
          versionRange: parsed.versionRange,
        },
      ]);

    const discoverRefs = (reqs: ReadonlyArray<SubagentSourceRequest>) =>
      provide(
        Effect.gen(function* () {
          const req = reqs[0];
          if (req === undefined) {
            return yield* makeAppError({
              code: "usage",
              detail: "No source request to discover from",
            });
          }

          return yield* sources
            .find(req.source, {
              names: req.requestedSubagents,
              type: "subagent" as const,
              owner: req.requestedOwner,
              versionRange: req.versionRange,
            })
            .pipe(
              Effect.map(
                Array.filter((ref): ref is SubagentExtensionRef => ref.type === "subagent"),
              ),
              Effect.mapError((error) => {
                return makeAppError({
                  code: "usage",
                  detail: "Failed to discover subagents from source",
                  suggestions: [{ description: discoverHowToFix(req.source, error) }],
                  cause: error,
                });
              }),
              Effect.flatMap((discoveredSubagents) =>
                !Array.isReadonlyArrayEmpty(discoveredSubagents)
                  ? Effect.succeed(discoveredSubagents)
                  : Effect.fail(
                      makeAppError({
                        code: "not_found",
                        detail: "No subagents found in source",
                        suggestions: [
                          {
                            description: noSubagentsFoundHowToFix(req.source),
                          },
                        ],
                      }),
                    ),
              ),
            );
        }),
      );

    const finalizeIntent = (
      parsed: ParsedSubagentInstallArgs,
      discoveredRefs: ReadonlyArray<SubagentExtensionRef>,
    ) =>
      provide(
        Effect.gen(function* () {
          const [firstDiscoveredRef, ...remainingDiscoveredRefs] = discoveredRefs;
          if (firstDiscoveredRef === undefined) {
            return yield* makeAppError({
              code: "not_found",
              detail: "No subagents found in source",
            });
          }
          const nonEmptyDiscoveredRefs: Array.NonEmptyReadonlyArray<SubagentExtensionRef> = [
            firstDiscoveredRef,
            ...remainingDiscoveredRefs,
          ];
          const selectedSubagents = yield* determineSubagentsToInstall(nonEmptyDiscoveredRefs, {
            requestedSubagents: parsed.requestedSubagents,
            all: parsed.all,
          });

          if (Array.isReadonlyArrayEmpty(selectedSubagents)) {
            return { subagentsToInstall: [] } satisfies InstallSubagentCommandIntent;
          }

          const diagnosticLines = verbose
            ? [
                `Source: ${sources.origin(parsed.source)} (${parsed.source.type})`,
                ...(parsed.resolutionProbes.length > 0
                  ? [
                      `Resolution: ${parsed.resolutionProbes.map((probe) => formatRegistryProbe(probe)).join("; ")}`,
                    ]
                  : []),
                `Found ${count(discoveredRefs.length, "subagent")}`,
              ]
            : undefined;

          return {
            subagentsToInstall: selectedSubagents.map((ref) => ({
              ref,
              versionRange:
                ref.refType === "registry" ? parsed.versionRange : Option.none<VersionRange>(),
            })),
            ...(diagnosticLines !== undefined ? { diagnosticLines } : {}),
          } satisfies InstallSubagentCommandIntent;
        }),
      );

    const buildPlan = (intent: InstallSubagentCommandIntent) =>
      Effect.gen(function* () {
        if (ws.scope === "user") {
          const agents = yield* agentRepo
            .getConfiguredAgents()
            .pipe(Effect.provideService(WorkspaceMutations, ws));
          const placements = yield* Effect.forEach(
            agents,
            (agent) =>
              agent
                .resolveEffectiveSubagentsDir({ workspaceRoot: ws.baseDir, scope: ws.scope })
                .pipe(
                  Effect.provideService(FileSystem.FileSystem, fsSvc),
                  Effect.provideService(Path.Path, pathSvc),
                  Effect.map((outcome) => ({ agentId: agent.id, outcome })),
                ),
            { concurrency: "unbounded" },
          );
          const refused = placements.flatMap(({ agentId, outcome }) =>
            outcome._tag === "unsupported"
              ? [`${agentId}: ${outcome.reason}`]
              : outcome._tag === "misconfigured" || outcome._tag === "disabled"
                ? [`${agentId}: ${outcome.reason}`]
                : [],
          );
          if (refused.length > 0) {
            return yield* makeAppError({
              code: "validation",
              detail: `Cannot install subagents in user scope for the configured agent placement: ${refused.join("; ")}`,
            });
          }
        }
        const steps = yield* Effect.forEach(
          intent.subagentsToInstall,
          (entry) =>
            Effect.gen(function* () {
              const ref = entry.ref;
              const previousLockEntry = yield* ws
                .getLockedSubagent(ref.subagent.name)
                .pipe(Effect.catch(() => Effect.succeed(Option.none())));
              const previousVersion = Option.match(previousLockEntry, {
                onNone: () => undefined,
                onSome: previousResolvedVersion,
              });
              const sourceHashBeforeInstall = Option.match(previousLockEntry, {
                onNone: () => undefined,
                onSome: previousSourceHash,
              });
              const version = ref.refType === "registry" ? ref.version : undefined;
              const buildArtifact = ({
                installedBefore,
              }: {
                readonly installedBefore: boolean;
              }): Effect.Effect<JobStepArtifact, AppError> =>
                Effect.gen(function* () {
                  const lockEntryOption = yield* ws
                    .getLockedSubagent(ref.subagent.name)
                    .pipe(Effect.catch(() => Effect.succeed(Option.none())));
                  const lockEntry = Option.getOrUndefined(lockEntryOption);
                  const sourceHash =
                    lockEntry !== undefined && "contentIdentity" in lockEntry
                      ? lockEntry.contentIdentity
                      : undefined;
                  const change = artifactChange({
                    installedBefore,
                    previousVersion,
                    version,
                    previousSourceHash: sourceHashBeforeInstall,
                    sourceHash,
                  });
                  const materialization =
                    subagentMgr.getLastMaterialization === undefined
                      ? { agents: [], targets: [] }
                      : yield* subagentMgr.getLastMaterialization({
                          target: { type: "subagent", name: ref.subagent.name },
                        });
                  const targets = materialization.targets.map((target) => ({
                    path: target.path,
                    change,
                    ...(target.agentIds === undefined ? {} : { agentIds: target.agentIds }),
                  }));

                  return {
                    path: targets[0]?.path ?? ref.subagent.name,
                    scope: ws.scope,
                    agents: materialization.agents,
                    ...(version !== undefined ? { version } : {}),
                    change,
                    ...(previousVersion !== undefined && previousVersion !== version
                      ? { previousVersion }
                      : {}),
                    ...(targets.length === 0 ? {} : { fileCount: targets.length, targets }),
                  } satisfies JobStepArtifact;
                });

              return buildInstallOperation(subagentMgr, {
                ref,
                versionRange: entry.versionRange,
                installedBefore: subagentMgr
                  .isInstalled({ target: { type: "subagent", name: ref.subagent.name } })
                  .pipe(Effect.catch(() => Effect.succeed(false))),
                buildArtifact,
              });
            }),
          { concurrency: 1 },
        );

        return {
          _tag: "Plan",
          name: intent.subagentsToInstall.length === 1 ? "Install subagent" : "Install subagents",
          description:
            intent.diagnosticLines === undefined
              ? Option.none()
              : Option.some(intent.diagnosticLines.join("\n")),
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
  }),
);
