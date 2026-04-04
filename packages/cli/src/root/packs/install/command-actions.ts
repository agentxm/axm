/**
 * Pack install command workflow actions.
 *
 * Implements `InstallExtensionCommandWorkflowActions` for the pack install
 * command. The live layer captures all required services at construction time
 * so action methods satisfy the `R = never` contract.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { makeAppError } from "@axm.sh/core/unstable/app-error";
import type { ExtensionRef } from "@axm.sh/core/unstable/extensions";
import { parseInputPattern } from "@axm.sh/core/unstable/sources";
import type { RegistrySource } from "@axm.sh/core/unstable/sources";
import { resolveSource, SourceHostProviders } from "@axm.sh/core/unstable/source-resolution";
import { Workspace } from "@axm.sh/core/unstable/workspace";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { SkillManager, type SkillExtensionRef } from "@axm.sh/core/unstable/skills";
import {
  PackManager,
  expandPackInstallRefs,
  type PackExtensionRef,
} from "@axm.sh/core/unstable/packs";
import { CommandManager, type CommandExtensionRef } from "@axm.sh/core/unstable/commands";
import { McpServerManager, type McpServerExtensionRef } from "@axm.sh/core/unstable/mcp-servers";
import { buildInstallOperation, targetFromRef, toLabel } from "@axm.sh/core/unstable/extensions";
import type { InstallExtensionCommandWorkflowActions } from "@axm.sh/core/unstable/workflows";
import type { Plan, PlannedJobStep } from "@axm.sh/core/unstable/workspace";
import type { InstallPackCommandIntent } from "./intent.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/** Raw handler args from the CLI parser. */
export interface InstallPackHandlerArgs {
  readonly source: string;
}

/** Parsed and validated pack install args. */
export interface ParsedPackInstallArgs {
  readonly profile: string;
  readonly packName: string;
  readonly versionConstraint: Option.Option<string>;
  readonly resolvedInput: string;
  readonly inputKind: "name-input" | "name-input-with-version" | "registry-pattern-input";
}

/** Source request for pack registry lookup. */
export interface PackSourceRequest {
  readonly source: RegistrySource;
  readonly profile: string;
  readonly packName: string;
  readonly versionConstraint: Option.Option<string>;
}

// -----------------------------------------------------------------------------
// Helpers (pure, no service dependencies)
// -----------------------------------------------------------------------------

const isAppError = (
  error: unknown,
): error is {
  readonly _tag: "AppError";
  readonly code: string;
  readonly what: string;
} =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  error._tag === "AppError" &&
  "code" in error &&
  typeof error.code === "string" &&
  "what" in error &&
  typeof error.what === "string";

const summarizeLookupError = (error: unknown): string => {
  if (isAppError(error)) {
    return `${error.what} (${error.code})`;
  }
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return String(error);
};

const isRemoteReadNotImplemented = (error: unknown): boolean =>
  isAppError(error) &&
  (error.code === "REGISTRY_REMOTE_NOT_SUPPORTED" ||
    (error.code.startsWith("REGISTRY_REMOTE_") && error.code.endsWith("_NOT_IMPLEMENTED")));

interface RegistryLookupProbe {
  readonly location: string;
  readonly outcome: "matched" | "not-found" | "error";
  readonly reason: Option.Option<string>;
}

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

const formatRegistrySourceLabel = ({
  source,
  registryHosts,
}: {
  readonly source: RegistrySource;
  readonly registryHosts: ReadonlyArray<{
    readonly name: string;
    readonly location: URL;
  }>;
}): string => {
  const matched = registryHosts.find((host) => host.location.href === source.location.href);
  if (matched !== undefined) {
    return `${matched.name} (${matched.location.href})`;
  }
  return source.location.href;
};

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

export class InstallPackCommandWorkflowActions extends ServiceMap.Service<
  InstallPackCommandWorkflowActions,
  InstallExtensionCommandWorkflowActions<
    InstallPackHandlerArgs,
    ParsedPackInstallArgs,
    PackSourceRequest,
    PackExtensionRef,
    InstallPackCommandIntent
  >
>()("InstallPackCommandWorkflowActions") {}

// -----------------------------------------------------------------------------
// Live Layer
// -----------------------------------------------------------------------------

/**
 * Constructs the actions by resolving all services at layer-build time.
 * Each action method closes over the captured services so `R = never`.
 */
export const InstallPackCommandWorkflowActionsLive = Layer.effect(
  InstallPackCommandWorkflowActions,
  Effect.gen(function* () {
    const sources = yield* SourceHostProviders;
    const ws = yield* Workspace;
    const renderer = yield* CliRenderer;
    const fsSvc = yield* FileSystem.FileSystem;
    const packMgr = yield* PackManager;
    const pathSvc = yield* Path.Path;
    const skillMgr = yield* SkillManager;
    const commandMgr = yield* CommandManager;
    const mcpServerMgr = yield* McpServerManager;

    // Build a service layer to provide to inner effects that still require
    // services via the Effect context (e.g. resolveSource).
    const envLayer = Layer.mergeAll(
      Layer.succeed(SourceHostProviders, sources),
      Layer.succeed(Workspace, ws),
      Layer.succeed(CliRenderer, renderer),
      Layer.succeed(FileSystem.FileSystem, fsSvc),
      Layer.succeed(Path.Path, pathSvc),
    );

    // Assertion needed: strips service requirements (R) from inner effects.
    // PromptCancelled propagates at runtime but is erased here;
    // the top-level `run()` function handles it as a clean exit.
    const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provide(effect, envLayer);

    const parseArgs = (args: InstallPackHandlerArgs) =>
      provide(
        Effect.gen(function* () {
          const trimmed = args.source.trim();
          const parsed = parseInputPattern(trimmed);

          // Handle bare name (e.g., "my-pack")
          if (Option.isSome(parsed) && parsed.value.pattern.pattern === "name-input") {
            const profile = yield* ws.getConfiguredProfile();
            yield* renderer.info(
              `Source resolution: ${trimmed} -> ${profile}/packs/${parsed.value.pattern.name}`,
            );
            return {
              inputKind: "name-input" as const,
              profile,
              packName: parsed.value.pattern.name,
              versionConstraint: Option.none<string>(),
              resolvedInput: `${profile}/packs/${parsed.value.pattern.name}`,
            };
          }

          // Handle bare name with version constraint (e.g., "my-pack@^2.0.0")
          if (Option.isNone(parsed) && !trimmed.startsWith("@") && trimmed.includes("@")) {
            const atIndex = trimmed.indexOf("@");
            const name = trimmed.slice(0, atIndex);
            const constraint = trimmed.slice(atIndex + 1);
            if (name && constraint && /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(name)) {
              const profile = yield* ws.getConfiguredProfile();
              yield* renderer.info(
                `Source resolution: ${trimmed} -> ${profile}/packs/${name}@${constraint}`,
              );
              return {
                inputKind: "name-input-with-version" as const,
                profile,
                packName: name,
                versionConstraint: Option.some(constraint),
                resolvedInput: `${profile}/packs/${name}@${constraint}`,
              };
            }
          }

          // Handle @profile/packs/pack-name[@constraint]
          if (Option.isSome(parsed) && parsed.value.pattern.pattern === "registry-pattern-input") {
            const pat = parsed.value.pattern;

            if (Option.isNone(pat.type) || pat.type.value !== "packs") {
              return yield* makeAppError({
                code: "PACK_SOURCE_INVALID_FORMAT",
                what: "Pack source must include /packs/ segment",
                details: [`Provided: ${trimmed}`],
                howToFix:
                  "Use @profile/packs/pack-name format. The /packs/ segment distinguishes packs from skills.",
              });
            }

            if (Option.isNone(pat.name)) {
              return yield* makeAppError({
                code: "PACK_SOURCE_MISSING_NAME",
                what: "Pack source must include a pack name",
                details: [`Provided: ${trimmed}`],
                howToFix: "Use @profile/packs/pack-name format.",
              });
            }

            return {
              inputKind: "registry-pattern-input" as const,
              profile: pat.profile,
              packName: pat.name.value,
              versionConstraint: pat.versionConstraint,
              resolvedInput: trimmed,
            };
          }

          // Reject everything else
          return yield* makeAppError({
            code: "PACK_SOURCE_NOT_REGISTRY",
            what: "Packs can only be installed from a registry",
            details: [`Provided: ${trimmed}`],
            howToFix:
              "Use @profile/packs/pack-name or just pack-name (resolved to default profile).",
          });
        }),
      );

    const resolveSourceRequests = (parsed: ParsedPackInstallArgs) =>
      provide(
        Effect.gen(function* () {
          const source = yield* renderer.withSpinner(
            "Parsing source...",
            () =>
              resolveSource(parsed.resolvedInput).pipe(
                Effect.mapError((error) =>
                  makeAppError({
                    code: "INVALID_SOURCE",
                    what: `Invalid source: ${error.message}`,
                    details: [`Provided: ${parsed.resolvedInput}`],
                    howToFix: "Use @profile/packs/pack-name or just pack-name.",
                    cause: error,
                  }),
                ),
              ),
            { successMessage: `Pack: ${parsed.profile}/packs/${parsed.packName}` },
          );

          if (source.type !== "registry") {
            return yield* makeAppError({
              code: "PACK_SOURCE_NOT_REGISTRY",
              what: "Packs can only be installed from a registry",
              details: [`Provided source type: ${source.type}`],
              howToFix: "Use a registry source: @profile/packs/pack-name",
            });
          }

          return [
            {
              source,
              profile: parsed.profile,
              packName: parsed.packName,
              versionConstraint: parsed.versionConstraint,
            },
          ];
        }),
      );

    const discoverRefs = (reqs: ReadonlyArray<PackSourceRequest>) =>
      provide(
        Effect.scoped(
          Effect.gen(function* () {
            // Pack install is single-source, take first request
            const req = reqs[0];
            if (!req) {
              return yield* makeAppError({
                code: "PACK_NO_SOURCE_REQUEST",
                what: "No source request provided",
              });
            }

            const discovered = yield* renderer.withSpinner(
              "Fetching pack from registry...",
              () =>
                Effect.gen(function* () {
                  const findWith = (candidate: RegistrySource) =>
                    sources.find(candidate, {
                      skillNames: [req.packName],
                      type: "pack",
                      profile: Option.some(req.profile),
                      versionConstraint: req.versionConstraint,
                    });

                  const probes: RegistryLookupProbe[] = [];

                  const initialResult = yield* findWith(req.source).pipe(Effect.result);
                  probes.push(
                    initialResult._tag === "Success"
                      ? {
                          location: req.source.location.href,
                          outcome: initialResult.success.length > 0 ? "matched" : "not-found",
                          reason: Option.none(),
                        }
                      : {
                          location: req.source.location.href,
                          outcome: "error",
                          reason: Option.some(summarizeLookupError(initialResult.failure)),
                        },
                  );

                  let resolvedRefs: ReadonlyArray<PackExtensionRef> | undefined;
                  let resolvedSource: RegistrySource = req.source;

                  if (initialResult._tag === "Success" && initialResult.success.length > 0) {
                    resolvedRefs = initialResult.success.filter(
                      (ref): ref is PackExtensionRef => ref.type === "pack",
                    );
                  } else if (
                    initialResult._tag === "Failure" &&
                    isRemoteReadNotImplemented(initialResult.failure)
                  ) {
                    // Fallback to file:// registries
                    const registryHosts = yield* ws.getRegistrySourceHosts();
                    const fallbackSources = registryHosts
                      .filter((host) => host.location.protocol === "file:")
                      .map(
                        (host) =>
                          ({
                            type: "registry" as const,
                            location: host.location,
                            profile: Option.some(req.profile),
                          }) satisfies RegistrySource,
                      );

                    for (const fallbackSource of fallbackSources) {
                      if (fallbackSource.location.href === req.source.location.href) continue;

                      const fallbackResult = yield* findWith(fallbackSource).pipe(Effect.result);
                      probes.push(
                        fallbackResult._tag === "Success"
                          ? {
                              location: fallbackSource.location.href,
                              outcome: fallbackResult.success.length > 0 ? "matched" : "not-found",
                              reason: Option.none(),
                            }
                          : {
                              location: fallbackSource.location.href,
                              outcome: "error",
                              reason: Option.some(summarizeLookupError(fallbackResult.failure)),
                            },
                      );

                      if (fallbackResult._tag === "Success" && fallbackResult.success.length > 0) {
                        resolvedRefs = fallbackResult.success.filter(
                          (ref): ref is PackExtensionRef => ref.type === "pack",
                        );
                        resolvedSource = fallbackSource;
                        break;
                      }
                    }

                    if (!resolvedRefs) {
                      return yield* makeAppError({
                        code: "PACK_FETCH_FAILED",
                        what: "Failed to fetch pack from registry",
                        details: [
                          `Pack: ${req.profile}/packs/${req.packName}`,
                          `Lookup probes: ${probes.map(formatRegistryProbe).join("; ")}`,
                        ],
                        howToFix:
                          "Remote registry discovery is not yet supported. Configure a file:// registry source or use a local registry source name.",
                      });
                    }
                  } else if (initialResult._tag === "Failure") {
                    return yield* makeAppError({
                      code: "PACK_FETCH_FAILED",
                      what: "Failed to fetch pack from registry",
                      details: [
                        `Pack: ${req.profile}/packs/${req.packName}`,
                        `Reason: ${summarizeLookupError(initialResult.failure)}`,
                      ],
                      howToFix: "Verify the pack name and registry configuration.",
                      cause: initialResult.failure,
                    });
                  }

                  // Log resolution probes for bare-name inputs
                  if (req.packName && probes.length > 0) {
                    yield* renderer.info(
                      `Host resolution: ${probes.map(formatRegistryProbe).join("; ")}`,
                    );
                  }

                  const registryHosts = yield* ws.getRegistrySourceHosts();
                  yield* renderer.info(
                    `Registry source: ${formatRegistrySourceLabel({ source: resolvedSource, registryHosts })}`,
                  );

                  if (!resolvedRefs || resolvedRefs.length === 0) {
                    return yield* makeAppError({
                      code: "PACK_NOT_FOUND",
                      what: `Pack "${req.packName}" not found in registry`,
                      howToFix: "Verify the pack name and check available packs.",
                    });
                  }

                  return resolvedRefs;
                }),
              { successMessage: "Found pack" },
            );

            return discovered;
          }),
        ),
      );

    const finalizeIntent = (parsed: ParsedPackInstallArgs, refs: ReadonlyArray<PackExtensionRef>) =>
      Effect.gen(function* () {
        const packRef = refs[0];
        if (!packRef) {
          return yield* makeAppError({
            code: "PACK_NOT_FOUND",
            what: "No pack reference found",
          });
        }

        if (packRef.type !== "pack") {
          return yield* makeAppError({
            code: "PACK_FETCH_FAILED",
            what: "Registry did not return a valid pack reference",
          });
        }

        return {
          packToInstall: packRef,
          versionConstraint: parsed.versionConstraint,
        };
      });

    const buildPlan = (intent: InstallPackCommandIntent) =>
      Effect.gen(function* () {
        const refs = yield* expandPackInstallRefs({
          pack: intent.packToInstall,
          supportedDependencyTypes: ["skill", "command", "mcp-server"],
          sources,
        });

        const steps = refs.map((ref: ExtensionRef): PlannedJobStep => {
          const target = targetFromRef(ref);

          if (ref.type === "pack") {
            return buildInstallOperation<PackExtensionRef>(packMgr, {
              ref,
              versionConstraint: intent.versionConstraint,
            });
          }

          if (ref.type === "skill") {
            return buildInstallOperation<SkillExtensionRef>(skillMgr, {
              ref,
              versionConstraint: Option.none(),
              skipSettings: true,
            });
          }

          if (ref.type === "command") {
            return buildInstallOperation<CommandExtensionRef>(commandMgr, {
              ref,
              versionConstraint: Option.none(),
              skipSettings: true,
            });
          }

          if (ref.type === "mcp-server") {
            return buildInstallOperation<McpServerExtensionRef>(mcpServerMgr, {
              ref,
              versionConstraint: Option.none(),
              skipSettings: true,
            });
          }

          return {
            label: toLabel(target),
            readiness: "error",
            errorMessage: "Unsupported dependency type",
          };
        });

        return {
          _tag: "Plan",
          name: "Install pack",
          description: Option.none(),
          jobs: [{ concurrency: 1 as const, steps }],
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
