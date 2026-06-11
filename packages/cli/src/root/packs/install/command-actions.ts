/**
 * Pack install command workflow actions.
 *
 * Implements `InstallExtensionCommandWorkflowActions` for the pack install
 * command. The live layer captures all required services at construction time
 * so action methods satisfy the `R = never` contract.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";

import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import {
  REGISTRY_EXTENSIONS_DIR,
  type ExtensionName,
  type ExtensionRef,
  type Handle,
} from "@agentxm/client-core/unstable/extensions";
import type { VersionRange } from "@agentxm/client-core/unstable/version-constraints";
import type { RegistrySource } from "@agentxm/client-core/unstable/sources";
import {
  resolveSource,
  SourceHostProviders,
} from "@agentxm/client-core/unstable/source-resolution";
import { Verbosity } from "@agentxm/client-core/unstable/cli-flags";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { SkillManager, type SkillExtensionRef } from "@agentxm/client-core/unstable/skills";
import {
  PackManager,
  expandPackInstallRefs,
  type PackRef,
} from "@agentxm/client-core/unstable/packs";
import { CommandManager, type CommandExtensionRef } from "@agentxm/client-core/unstable/commands";
import { FilesManager, type FilesExtensionRef } from "@agentxm/client-core/unstable/files";
import { HookManager, type HookExtensionRef } from "@agentxm/client-core/unstable/hooks";
import { RuleManager, type RuleExtensionRef } from "@agentxm/client-core/unstable/rules";
import { McpServerManager, type McpServerExtensionRef } from "@agentxm/client-core/unstable/mcps";
import {
  SubagentManager,
  type SubagentExtensionRef,
} from "@agentxm/client-core/unstable/subagents";
import {
  buildUninstallOperation,
  buildInstallOperation,
  parseExtensionFqnParts,
  targetFromRef,
  toLabel,
} from "@agentxm/client-core/unstable/extensions";
import type { InstallExtensionCommandWorkflowActions } from "@agentxm/client-core/unstable/workflows";
import type { JobStepArtifact, Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import {
  parseMinimumReleaseAge,
  type ReleaseAgePolicy,
} from "@agentxm/client-core/unstable/registry";
import type {
  CommandExtensionTarget,
  FilesExtensionTarget,
  HookExtensionTarget,
  McpServerExtensionTarget,
  RuleExtensionTarget,
  SkillExtensionTarget,
  SubagentExtensionTarget,
} from "@agentxm/client-core/unstable/workspace";
import type { InstallPackCommandIntent } from "./intent.js";
import { parseRegistryInstallTarget } from "../../shared/registry-install-target.js";
import { makeWorkspaceRetentionPolicy } from "../../shared/workspace-retention-policy.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/** Raw handler args from the CLI parser. */
export interface InstallPackHandlerArgs {
  readonly source: string;
  readonly unattended?: boolean;
}

/** Parsed and validated pack install args. */
export interface ParsedPackInstallArgs {
  readonly owner: Handle;
  readonly packName: ExtensionName;
  readonly versionRange: Option.Option<VersionRange>;
  readonly resolvedInput: string;
  readonly inputKind: "name-input" | "name-input-with-version" | "registry-pattern-input";
  readonly sourceResolution?: string;
  readonly unattended: boolean;
}

/** Source request for pack registry lookup. */
export interface PackSourceRequest {
  readonly source: RegistrySource;
  readonly owner: Handle;
  readonly packName: ExtensionName;
  readonly versionRange: Option.Option<VersionRange>;
  readonly sourceResolution?: string;
}

interface PackDiscoveryResult {
  readonly ref: PackRef;
  readonly diagnosticLines?: ReadonlyArray<string>;
}

// -----------------------------------------------------------------------------
// Helpers (pure, no service dependencies)
// -----------------------------------------------------------------------------

const isAppError = (
  error: unknown,
): error is {
  readonly _tag: "AppError";
  readonly code: string;
  readonly detail: string;
} =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  error._tag === "AppError" &&
  "code" in error &&
  typeof error.code === "string" &&
  "detail" in error &&
  typeof error.detail === "string";

const summarizeLookupError = (error: unknown): string => {
  if (isAppError(error)) {
    return `${error.detail} (${error.code})`;
  }
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return String(error);
};

const isRemoteReadNotImplemented = (error: unknown): boolean =>
  isAppError(error) &&
  (error.detail.includes("not implemented") || error.detail.includes("not yet supported"));

interface RegistryLookupProbe {
  readonly location: string;
  readonly outcome: "matched" | "not-found" | "error";
  readonly reason: Option.Option<string>;
}

type PackDependencyNameSets = {
  readonly skill: Set<string>;
  readonly command: Set<string>;
  readonly "mcp-server": Set<string>;
  readonly subagent: Set<string>;
  readonly files: Set<string>;
  readonly rule: Set<string>;
  readonly hook: Set<string>;
};

type DroppedPackDependencyTarget =
  | SkillExtensionTarget
  | CommandExtensionTarget
  | McpServerExtensionTarget
  | SubagentExtensionTarget
  | FilesExtensionTarget
  | RuleExtensionTarget
  | HookExtensionTarget;

const makePackDependencyNameSets = (): PackDependencyNameSets => ({
  skill: new Set<string>(),
  command: new Set<string>(),
  "mcp-server": new Set<string>(),
  subagent: new Set<string>(),
  files: new Set<string>(),
  rule: new Set<string>(),
  hook: new Set<string>(),
});

const nameFromFqn = (fqn: string): string => parseExtensionFqnParts(fqn)?.name ?? fqn;

const collectResolvedDependencyNames = (
  refs: ReadonlyArray<ExtensionRef>,
): PackDependencyNameSets => {
  const names = makePackDependencyNameSets();

  for (const ref of refs) {
    switch (ref.type) {
      case "pack":
        break;
      case "skill":
        names.skill.add(ref.skill.name);
        break;
      case "command":
        names.command.add(ref.command.name);
        break;
      case "mcp-server":
        names["mcp-server"].add(ref.server.name);
        break;
      case "subagent":
        names.subagent.add(ref.subagent.name);
        break;
      case "files":
        names.files.add(ref.file.name);
        break;
      case "rule":
        names.rule.add(ref.rule.name);
        break;
      case "hook":
        names.hook.add(ref.hook.name);
        break;
    }
  }

  return names;
};

const collectDirectlyConfiguredNames = (args: {
  readonly skills: Readonly<Record<string, unknown>>;
  readonly commands: Readonly<Record<string, unknown>>;
  readonly mcpServers: Readonly<Record<string, unknown>>;
  readonly subagents: Readonly<Record<string, unknown>>;
  readonly files: Readonly<Record<string, unknown>>;
  readonly rules: Readonly<Record<string, unknown>>;
  readonly hooks: Readonly<Record<string, unknown>>;
}): PackDependencyNameSets => ({
  skill: new Set(Object.keys(args.skills)),
  command: new Set(Object.keys(args.commands)),
  "mcp-server": new Set(Object.keys(args.mcpServers)),
  subagent: new Set(Object.keys(args.subagents)),
  files: new Set(Object.keys(args.files)),
  rule: new Set(Object.keys(args.rules)),
  hook: new Set(Object.keys(args.hooks)),
});

const collectDroppedPackDependencyTargets = (args: {
  readonly lockedPack: {
    readonly resolvedSkills: Readonly<Record<string, string>>;
    readonly resolvedCommands: Readonly<Record<string, string>>;
    readonly resolvedMcpServers: Readonly<Record<string, string>>;
    readonly resolvedSubagents: Readonly<Record<string, string>>;
    readonly resolvedFiles?: Readonly<Record<string, string>> | undefined;
    readonly resolvedRules?: Readonly<Record<string, string>> | undefined;
    readonly resolvedHooks?: Readonly<Record<string, string>> | undefined;
  };
  readonly nextDependencies: PackDependencyNameSets;
  readonly directlyConfigured: PackDependencyNameSets;
}): ReadonlyArray<DroppedPackDependencyTarget> => {
  const droppedTargets: Array<DroppedPackDependencyTarget> = [];

  for (const fqn of Object.keys(args.lockedPack.resolvedSkills)) {
    const name = nameFromFqn(fqn);
    if (!args.nextDependencies.skill.has(name) && !args.directlyConfigured.skill.has(name)) {
      droppedTargets.push({ type: "skill", name });
    }
  }

  for (const fqn of Object.keys(args.lockedPack.resolvedCommands)) {
    const name = nameFromFqn(fqn);
    if (!args.nextDependencies.command.has(name) && !args.directlyConfigured.command.has(name)) {
      droppedTargets.push({ type: "command", name });
    }
  }

  for (const fqn of Object.keys(args.lockedPack.resolvedMcpServers)) {
    const name = nameFromFqn(fqn);
    if (
      !args.nextDependencies["mcp-server"].has(name) &&
      !args.directlyConfigured["mcp-server"].has(name)
    ) {
      droppedTargets.push({ type: "mcp-server", name });
    }
  }

  for (const fqn of Object.keys(args.lockedPack.resolvedSubagents)) {
    const name = nameFromFqn(fqn);
    if (!args.nextDependencies.subagent.has(name) && !args.directlyConfigured.subagent.has(name)) {
      droppedTargets.push({ type: "subagent", name });
    }
  }

  for (const fqn of Object.keys(args.lockedPack.resolvedFiles ?? {})) {
    const name = nameFromFqn(fqn);
    if (!args.nextDependencies.files.has(name) && !args.directlyConfigured.files.has(name)) {
      droppedTargets.push({ type: "files", name });
    }
  }

  for (const fqn of Object.keys(args.lockedPack.resolvedRules ?? {})) {
    const name = nameFromFqn(fqn);
    if (!args.nextDependencies.rule.has(name) && !args.directlyConfigured.rule.has(name)) {
      droppedTargets.push({ type: "rule", name });
    }
  }

  for (const fqn of Object.keys(args.lockedPack.resolvedHooks ?? {})) {
    const name = nameFromFqn(fqn);
    if (!args.nextDependencies.hook.has(name) && !args.directlyConfigured.hook.has(name)) {
      droppedTargets.push({ type: "hook", name });
    }
  }

  return droppedTargets;
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

const registryPluralSegment = (ref: ExtensionRef): string => {
  switch (ref.type) {
    case "skill":
      return "skills";
    case "pack":
      return "packs";
    case "command":
      return "commands";
    case "mcp-server":
      return "mcps";
    case "subagent":
      return "subagents";
    case "files":
      return "files";
    case "rule":
      return "rules";
    case "hook":
      return "hooks";
  }
};

const registrySourceArtifact = (args: {
  readonly ref: ExtensionRef;
  readonly scope: JobStepArtifact["scope"];
  readonly installedBefore: boolean;
}): JobStepArtifact => {
  const change = args.installedBefore ? "updated" : "created";
  const target = targetFromRef(args.ref);
  const sourcePath =
    args.ref.refType === "registry"
      ? `${REGISTRY_EXTENSIONS_DIR}/${args.ref.owner}/${registryPluralSegment(args.ref)}/${
          args.ref.name
        }`
      : toLabel(target);
  return {
    path: sourcePath,
    scope: args.scope,
    ...(args.ref.refType === "registry" ? { version: args.ref.version } : {}),
    change,
    fileCount: 1,
    targets: [{ path: sourcePath, change }],
  };
};

const resolveReleaseAgePolicy = (
  ws: ServiceMap.Service.Shape<typeof WorkspaceMutations>,
  unattended: boolean,
): Effect.Effect<Option.Option<ReleaseAgePolicy>, AppError> =>
  Effect.gen(function* () {
    if (!unattended) return Option.none<ReleaseAgePolicy>();

    const minimumReleaseAge = yield* ws.getMinimumReleaseAge();
    const minimumAgeMs = parseMinimumReleaseAge(minimumReleaseAge);
    if (Option.isNone(minimumAgeMs)) {
      return yield* makeAppError({
        code: "validation",
        detail: `Invalid minimumReleaseAge "${minimumReleaseAge}"`,
        recover: "Use a duration such as 24h, 1440m, or 0s.",
      });
    }

    return Option.some({ minimumAgeMs: minimumAgeMs.value, now: new Date() });
  });

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

export class InstallPackCommandWorkflowActions extends ServiceMap.Service<
  InstallPackCommandWorkflowActions,
  InstallExtensionCommandWorkflowActions<
    InstallPackHandlerArgs,
    ParsedPackInstallArgs,
    PackSourceRequest,
    PackDiscoveryResult,
    InstallPackCommandIntent
  >
>()("axm.sh/root/packs/install/command-actions/InstallPackCommandWorkflowActions") {}

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
    const ws = yield* WorkspaceMutations;
    const renderer = yield* CliRenderer;
    const fsSvc = yield* FileSystem.FileSystem;
    const packMgr = yield* PackManager;
    const pathSvc = yield* Path.Path;
    const skillMgr = yield* SkillManager;
    const commandMgr = yield* CommandManager;
    const contextManager = yield* FilesManager;
    const ruleManager = yield* RuleManager;
    const hookManager = yield* HookManager;
    const mcpServerMgr = yield* McpServerManager;
    const subagentMgr = yield* SubagentManager;
    const verbosityOption = yield* Effect.serviceOption(Verbosity);
    const verbose = Option.match(verbosityOption, {
      onNone: () => false,
      onSome: (verbosity) => verbosity.isAtLeast("verbose"),
    });

    // Build a service layer to provide to inner effects that still require
    // services via the Effect context (e.g. resolveSource).
    const envLayer = Layer.mergeAll(
      Layer.succeed(SourceHostProviders, sources),
      Layer.succeed(WorkspaceMutations, ws),
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
          const parsed = parseRegistryInstallTarget(trimmed, {
            expectedType: "pack",
            allowBareName: true,
            allowBareVersionRange: true,
          });

          if (Result.isSuccess(parsed)) {
            if (parsed.success.kind === "registry") {
              return {
                inputKind: "registry-pattern-input" as const,
                owner: parsed.success.owner,
                packName: parsed.success.name,
                versionRange: Option.fromUndefinedOr(parsed.success.versionRange),
                resolvedInput: trimmed,
                unattended: args.unattended ?? false,
              };
            }

            const owner = yield* ws.getConfiguredOwner().pipe(
              Effect.flatMap(
                Option.match({
                  onNone: () =>
                    Effect.fail(
                      makeAppError({
                        code: "internal",
                        detail: `Cannot resolve bare pack name "${parsed.success.name}" without a configured owner`,
                        suggestions: [
                          {
                            description:
                              "Use the fully-qualified `@owner/packs/name` form, set `owner` in settings, or sign in.",
                            cmd: "axm login",
                          },
                        ],
                      }),
                    ),
                  onSome: Effect.succeed,
                }),
              ),
            );
            const versionRange = Option.fromUndefinedOr(parsed.success.versionRange);
            const resolvedInput = Option.match(versionRange, {
              onNone: () => `${owner}/packs/${parsed.success.name}`,
              onSome: (constraint) => `${owner}/packs/${parsed.success.name}@${constraint}`,
            });

            return {
              inputKind:
                parsed.success.versionRange === undefined
                  ? ("name-input" as const)
                  : ("name-input-with-version" as const),
              owner,
              packName: parsed.success.name,
              versionRange,
              resolvedInput,
              sourceResolution: `${trimmed} -> ${resolvedInput}`,
              unattended: args.unattended ?? false,
            };
          }

          switch (parsed.failure.kind) {
            case "wrong-type":
              return yield* makeAppError({
                code: "validation",
                detail: "Pack source must include /packs/ segment",
                suggestions: [
                  {
                    description:
                      "Use @owner/packs/pack-name format. The /packs/ segment distinguishes packs from skills.",
                  },
                ],
              });
            case "missing-name":
              return yield* makeAppError({
                code: "not_found",
                detail: "Pack source must include a pack name",
                suggestions: [{ description: "Use @owner/packs/pack-name format." }],
              });
            default:
              return yield* makeAppError({
                code: "usage",
                detail: "Packs can only be installed from a registry",
                suggestions: [
                  {
                    description:
                      "Use @owner/packs/pack-name or just pack-name (resolved to default owner).",
                  },
                ],
              });
          }
        }),
      );

    const resolveSourceRequests = (parsed: ParsedPackInstallArgs) =>
      provide(
        Effect.gen(function* () {
          const source = yield* resolveSource(parsed.resolvedInput).pipe(
            Effect.mapError((error) =>
              makeAppError({
                code: "validation",
                detail: `Invalid source: ${error.message}`,
                suggestions: [
                  {
                    description: "Use @owner/packs/pack-name or just pack-name.",
                  },
                ],
                cause: error,
              }),
            ),
          );

          if (source.type !== "registry") {
            return yield* makeAppError({
              code: "usage",
              detail: "Packs can only be installed from a registry",
              suggestions: [{ description: "Use a registry source: @owner/packs/pack-name" }],
            });
          }

          return [
            {
              source,
              owner: parsed.owner,
              packName: parsed.packName,
              versionRange: parsed.versionRange,
              ...(parsed.sourceResolution !== undefined
                ? { sourceResolution: parsed.sourceResolution }
                : {}),
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
                code: "usage",
                detail: "No source request provided",
              });
            }

            return yield* Effect.gen(function* () {
              const findWith = (candidate: RegistrySource) =>
                sources.find(candidate, {
                  names: [req.packName],
                  type: "pack",
                  owner: Option.some(req.owner),
                  versionRange: req.versionRange,
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

              let resolvedRefs: ReadonlyArray<PackRef> | undefined;
              let resolvedSource: RegistrySource = req.source;

              if (initialResult._tag === "Success" && initialResult.success.length > 0) {
                resolvedRefs = initialResult.success.filter(
                  (ref): ref is PackRef => ref.type === "pack",
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
                        owner: Option.some(req.owner),
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
                      (ref): ref is PackRef => ref.type === "pack",
                    );
                    resolvedSource = fallbackSource;
                    break;
                  }
                }

                if (!resolvedRefs) {
                  return yield* makeAppError({
                    code: "network",
                    detail: "Pack could not be fetched from registry",
                    suggestions: [
                      {
                        description:
                          "Remote registry discovery is not yet supported. Configure a file:// registry source or use a local registry source name.",
                      },
                    ],
                  });
                }
              } else if (initialResult._tag === "Failure") {
                return yield* makeAppError({
                  code: "network",
                  detail: "Pack could not be fetched from registry",
                  suggestions: [
                    {
                      description: "Verify the pack name and registry configuration.",
                    },
                  ],
                  cause: initialResult.failure,
                });
              }

              const registryHosts = yield* ws.getRegistrySourceHosts();
              const diagnosticLines = verbose
                ? [
                    `Pack: ${req.owner}/packs/${req.packName}`,
                    ...(req.sourceResolution !== undefined
                      ? [`Source resolution: ${req.sourceResolution}`]
                      : []),
                    ...(probes.length > 0
                      ? [`Host resolution: ${probes.map(formatRegistryProbe).join("; ")}`]
                      : []),
                    `Registry source: ${formatRegistrySourceLabel({ source: resolvedSource, registryHosts })}`,
                    "Found pack",
                  ]
                : undefined;

              if (!resolvedRefs || resolvedRefs.length === 0) {
                return yield* makeAppError({
                  code: "not_found",
                  detail: `Pack "${req.packName}" not found in registry`,
                  suggestions: [
                    {
                      description: "Verify the pack name and check available packs.",
                    },
                  ],
                });
              }

              return resolvedRefs.map((ref) => ({
                ref,
                ...(diagnosticLines !== undefined ? { diagnosticLines } : {}),
              }));
            });
          }),
        ),
      );

    const finalizeIntent = (
      parsed: ParsedPackInstallArgs,
      refs: ReadonlyArray<PackDiscoveryResult>,
    ) =>
      Effect.gen(function* () {
        const discovery = refs[0];
        if (!discovery) {
          return yield* makeAppError({
            code: "not_found",
            detail: "No pack reference found",
          });
        }

        const packRef = discovery.ref;
        if (packRef.type !== "pack") {
          return yield* makeAppError({
            code: "network",
            detail: "Registry did not return a valid pack reference",
          });
        }

        return {
          packToInstall: packRef,
          versionRange: parsed.versionRange,
          unattended: parsed.unattended,
          ...(discovery.diagnosticLines !== undefined
            ? { diagnosticLines: discovery.diagnosticLines }
            : {}),
        };
      });

    const buildPlan = (intent: InstallPackCommandIntent) =>
      Effect.gen(function* () {
        const releaseAgePolicy = yield* resolveReleaseAgePolicy(ws, intent.unattended ?? false);
        const refs = yield* expandPackInstallRefs({
          pack: intent.packToInstall,
          supportedDependencyTypes: [
            "skill",
            "command",
            "mcp-server",
            "subagent",
            "files",
            "rule",
            "hook",
          ],
          sources,
          releaseAgePolicy,
        });
        const lockedPack = yield* ws.getLockedPack(intent.packToInstall.pack.name);
        const [
          configuredSkills,
          configuredCommands,
          configuredMcpServers,
          configuredSubagents,
          configuredFiles,
          configuredRules,
          configuredHooks,
          lockedSkills,
          lockedCommands,
          lockedMcpServers,
          lockedSubagents,
          lockedFiles,
          lockedRules,
          lockedHooks,
        ] = yield* Effect.all(
          [
            ws.records.getConfiguredSkills(),
            ws.records.getConfiguredCommands(),
            ws.records.getConfiguredMcpServers(),
            ws.records.getConfiguredSubagents(),
            ws.getConfiguredFilesEntries(),
            ws.getConfiguredRuleEntries(),
            ws.getConfiguredHookEntries(),
            ws.getLockedSkills(),
            ws.getLockedCommands(),
            ws.getLockedMcpServers(),
            ws.getLockedSubagents(),
            ws.getLockedFiles(),
            ws.getLockedRules(),
            ws.getLockedHooks(),
          ],
          { concurrency: "unbounded" },
        );

        const retentionPolicy = makeWorkspaceRetentionPolicy(ws);

        const installSteps = refs.map((ref: ExtensionRef): PlannedJobStep => {
          const target = targetFromRef(ref);

          if (ref.type === "pack") {
            const installedBefore = Option.isSome(lockedPack);
            return buildInstallOperation<PackRef>(packMgr, {
              ref,
              versionRange: intent.versionRange,
              installedBefore: Effect.succeed(installedBefore),
              buildArtifact: ({ installedBefore }) =>
                Effect.succeed(registrySourceArtifact({ ref, scope: ws.scope, installedBefore })),
            });
          }

          if (ref.type === "skill") {
            const installedBefore = Object.hasOwn(lockedSkills, ref.skill.name);
            return buildInstallOperation<SkillExtensionRef>(skillMgr, {
              ref,
              versionRange: Option.none(),
              skipSettings: true,
              retainedByPack: true,
              installedBefore: Effect.succeed(installedBefore),
              buildArtifact: ({ installedBefore }) =>
                Effect.succeed(registrySourceArtifact({ ref, scope: ws.scope, installedBefore })),
            });
          }

          if (ref.type === "command") {
            const installedBefore = Object.hasOwn(lockedCommands, ref.command.name);
            return buildInstallOperation<CommandExtensionRef>(commandMgr, {
              ref,
              versionRange: Option.none(),
              skipSettings: true,
              installedBefore: Effect.succeed(installedBefore),
              buildArtifact: ({ installedBefore }) =>
                Effect.succeed(registrySourceArtifact({ ref, scope: ws.scope, installedBefore })),
            });
          }

          if (ref.type === "mcp-server") {
            const installedBefore = Object.hasOwn(lockedMcpServers, ref.server.name);
            return buildInstallOperation<McpServerExtensionRef>(mcpServerMgr, {
              ref,
              versionRange: Option.none(),
              skipSettings: true,
              installedBefore: Effect.succeed(installedBefore),
              buildArtifact: ({ installedBefore }) =>
                Effect.succeed(registrySourceArtifact({ ref, scope: ws.scope, installedBefore })),
            });
          }

          if (ref.type === "subagent") {
            const installedBefore = Object.hasOwn(lockedSubagents, ref.subagent.name);
            return buildInstallOperation<SubagentExtensionRef>(subagentMgr, {
              ref,
              versionRange: Option.none(),
              skipSettings: true,
              installedBefore: Effect.succeed(installedBefore),
              buildArtifact: ({ installedBefore }) =>
                Effect.succeed(registrySourceArtifact({ ref, scope: ws.scope, installedBefore })),
            });
          }

          if (ref.type === "files") {
            const installedBefore = Object.hasOwn(lockedFiles, ref.file.name);
            return buildInstallOperation<FilesExtensionRef>(contextManager, {
              ref,
              versionRange: Option.none(),
              skipSettings: true,
              retainedByPack: true,
              installedBefore: Effect.succeed(installedBefore),
              buildArtifact: ({ installedBefore }) =>
                Effect.succeed(registrySourceArtifact({ ref, scope: ws.scope, installedBefore })),
            });
          }

          if (ref.type === "rule") {
            const installedBefore = Object.hasOwn(lockedRules, ref.rule.name);
            return buildInstallOperation<RuleExtensionRef>(ruleManager, {
              ref,
              versionRange: Option.none(),
              skipSettings: true,
              retainedByPack: true,
              installedBefore: Effect.succeed(installedBefore),
              buildArtifact: ({ installedBefore }) =>
                Effect.succeed(registrySourceArtifact({ ref, scope: ws.scope, installedBefore })),
            });
          }

          if (ref.type === "hook") {
            const installedBefore = Object.hasOwn(lockedHooks, ref.hook.name);
            return buildInstallOperation<HookExtensionRef>(hookManager, {
              ref,
              versionRange: Option.none(),
              skipSettings: true,
              retainedByPack: true,
              installedBefore: Effect.succeed(installedBefore),
              buildArtifact: ({ installedBefore }) =>
                Effect.succeed(registrySourceArtifact({ ref, scope: ws.scope, installedBefore })),
            });
          }

          return {
            label: toLabel(target),
            readiness: "error",
            errorMessage: "Unsupported dependency type",
          };
        });

        const directlyConfigured = collectDirectlyConfiguredNames({
          skills: configuredSkills,
          commands: configuredCommands,
          mcpServers: configuredMcpServers,
          subagents: configuredSubagents,
          files: configuredFiles,
          rules: configuredRules,
          hooks: configuredHooks,
        });
        const nextDependencies = collectResolvedDependencyNames(refs);
        const droppedTargets = Option.match(lockedPack, {
          onNone: () => [],
          onSome: (entry) =>
            collectDroppedPackDependencyTargets({
              lockedPack: entry,
              nextDependencies,
              directlyConfigured,
            }),
        });
        const uninstallSteps = droppedTargets.map((target): PlannedJobStep => {
          if (target.type === "skill") {
            return buildUninstallOperation<SkillExtensionRef>(skillMgr, retentionPolicy, {
              target,
            });
          }

          if (target.type === "command") {
            return buildUninstallOperation<CommandExtensionRef>(commandMgr, retentionPolicy, {
              target,
            });
          }

          if (target.type === "mcp-server") {
            return buildUninstallOperation<McpServerExtensionRef>(mcpServerMgr, retentionPolicy, {
              target,
            });
          }

          if (target.type === "subagent") {
            return buildUninstallOperation<SubagentExtensionRef>(subagentMgr, retentionPolicy, {
              target,
            });
          }

          if (target.type === "files") {
            return buildUninstallOperation<FilesExtensionRef>(contextManager, retentionPolicy, {
              target,
            });
          }

          if (target.type === "rule") {
            return buildUninstallOperation<RuleExtensionRef>(ruleManager, retentionPolicy, {
              target,
            });
          }

          if (target.type === "hook") {
            return buildUninstallOperation<HookExtensionRef>(hookManager, retentionPolicy, {
              target,
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
          description:
            intent.diagnosticLines === undefined
              ? Option.none()
              : Option.some(intent.diagnosticLines.join("\n")),
          jobs: [{ concurrency: 1 as const, steps: [...installSteps, ...uninstallSteps] }],
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
