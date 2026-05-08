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
import { nonInteractiveFlag } from "@agentxm/client-core/unstable/cli-flags";
import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import type { Handle } from "@agentxm/client-core/unstable/extensions";
import type { VersionConstraint } from "@agentxm/client-core/unstable/version-constraints";
import { parseInputPattern } from "@agentxm/client-core/unstable/sources";
import type { Source, InputParseResult } from "@agentxm/client-core/unstable/sources";
import { SourceHostProviders } from "@agentxm/client-core/unstable/source-resolution";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import {
  SubagentManager,
  type SubagentExtensionRef,
} from "@agentxm/client-core/unstable/subagents";
import { buildInstallOperation } from "@agentxm/client-core/unstable/extensions";
import type { InstallExtensionCommandWorkflowActions } from "@agentxm/client-core/unstable/workflows";
import type { Plan } from "@agentxm/client-core/unstable/plan";
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
  readonly versionConstraint: Option.Option<VersionConstraint>;
  readonly requestedSubagents: ReadonlyArray<string>;
  readonly requestedOwner: Option.Option<Handle>;
  readonly all: boolean;
}

/**
 * Source request for subagent install discovery.
 */
export interface SubagentSourceRequest {
  readonly source: Source;
  readonly requestedSubagents: ReadonlyArray<string>;
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
  "message" in error &&
  "code" in error;

const isRemoteReadNotImplemented = (error: unknown): boolean =>
  isAppErrorCheck(error) && error.message.includes("not implemented");

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
>()("axm.sh/InstallSubagentCommandWorkflowActions") {}

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
    const ws = yield* WorkspaceMutations;
    const pathSvc = yield* Path.Path;
    const fsSvc = yield* FileSystem.FileSystem;
    const terminal = yield* Terminal.Terminal;
    const nonInteractive = yield* nonInteractiveFlag;

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
          yield* renderer.info(`axm subagents install (${ws.scope})`);

          const parsed = yield* renderer.withSpinner(
            "Parsing source...",
            () =>
              Effect.gen(function* () {
                const parsedSourceOption = parseInputPattern(args.source.trim());
                if (Option.isNone(parsedSourceOption)) {
                  return yield* makeAppError({
                    code: "validation",
                    message: "Invalid source: Unable to parse source",
                    breadcrumbs: [
                      {
                        task: "Recover",
                        description:
                          "Valid formats: local path, github:owner/repo, gitlab:owner/repo, or https://example.com",
                      },
                    ],
                  });
                }

                const parsedSource = parsedSourceOption.value;
                const versionConstraint =
                  parsedSource.pattern.pattern === "registry-pattern-input"
                    ? parsedSource.pattern.versionConstraint
                    : Option.none<VersionConstraint>();

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
                  versionConstraint,
                  requestedSubagents,
                  requestedOwner,
                  resolutionProbes,
                };
              }),
            {
              successMessage: ({ source }) => `Source: ${sources.origin(source)} (${source.type})`,
            },
          );

          const {
            source,
            versionConstraint,
            requestedSubagents,
            requestedOwner,
            resolutionProbes,
          } = parsed;

          if (resolutionProbes.length > 0) {
            yield* renderer.message(
              `Resolution: ${resolutionProbes.map((probe) => formatRegistryProbe(probe)).join("; ")}`,
            );
          }

          return {
            source,
            versionConstraint,
            requestedSubagents,
            requestedOwner,
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
          versionConstraint: parsed.versionConstraint,
        },
      ]);

    const discoverRefs = (reqs: ReadonlyArray<SubagentSourceRequest>) =>
      provide(
        Effect.scoped(
          Effect.gen(function* () {
            const req = reqs[0];
            if (req === undefined) {
              return yield* makeAppError({
                code: "usage",
                message: "No source request to discover from",
              });
            }

            return yield* renderer.withSpinner(
              "Discovering subagents...",
              () =>
                sources
                  .find(req.source, {
                    names: req.requestedSubagents,
                    type: "subagent" as const,
                    owner: req.requestedOwner,
                    versionConstraint: req.versionConstraint,
                  })
                  .pipe(
                    Effect.map(
                      Array.filter((ref): ref is SubagentExtensionRef => ref.type === "subagent"),
                    ),
                    Effect.mapError((error) => {
                      return makeAppError({
                        code: "usage",
                        message: "Failed to discover subagents from source",
                        breadcrumbs: [
                          { task: "Recover", description: discoverHowToFix(req.source, error) },
                        ],
                        cause: error,
                      });
                    }),
                    Effect.flatMap((discoveredSubagents) =>
                      !Array.isReadonlyArrayEmpty(discoveredSubagents)
                        ? Effect.succeed(discoveredSubagents)
                        : Effect.fail(
                            makeAppError({
                              code: "not_found",
                              message: "No subagents found in source",
                              breadcrumbs: [
                                {
                                  task: "Recover",
                                  description: noSubagentsFoundHowToFix(req.source),
                                },
                              ],
                            }),
                          ),
                    ),
                  ),
              {
                successMessage: (discoveredSubagents) =>
                  `Found ${discoveredSubagents.length} subagent(s)`,
              },
            );
          }),
        ),
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
              message: "No subagents found in source",
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
            yield* renderer.warn("No subagents selected.");
            yield* renderer.success("Nothing to install.");
            return { subagentsToInstall: [] } satisfies InstallSubagentCommandIntent;
          }

          return {
            subagentsToInstall: selectedSubagents.map((ref) => ({
              ref,
              versionConstraint:
                ref.refType === "registry"
                  ? parsed.versionConstraint
                  : Option.none<VersionConstraint>(),
            })),
          } satisfies InstallSubagentCommandIntent;
        }),
      );

    const buildPlan = (intent: InstallSubagentCommandIntent) =>
      Effect.succeed<Plan>({
        _tag: "Plan",
        name: "Install subagent(s)",
        description: Option.none(),
        jobs: [
          {
            concurrency: 1 as const,
            steps: intent.subagentsToInstall.map((entry) =>
              buildInstallOperation(subagentMgr, {
                ref: entry.ref,
                versionConstraint: entry.versionConstraint,
              }),
            ),
          },
        ],
      } satisfies Plan);

    return {
      parseArgs,
      resolveSourceRequests,
      discoverRefs,
      finalizeIntent,
      buildPlan,
    };
  }),
);
