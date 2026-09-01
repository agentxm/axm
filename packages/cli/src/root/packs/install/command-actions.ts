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
import * as DateTime from "effect/DateTime";
import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as Path from "effect/Path";
import * as Result from "effect/Result";

import {
  formatRegistryProbe,
  type RegistryLookupProbe,
} from "../../shared/install-source-resolution.js";

import { CodingAgentRepository } from "@agentxm/extension-management/unstable/extension-workspace";
import { makeAppError, type AppError } from "@agentxm/extension-management/unstable/app-error";
import {
  evaluateSourceAuthority,
  type SourceAuthorityBlockedFact,
  type SourceAuthorityInput,
} from "@agentxm/extension-management/unstable/extensions";
import {
  ACQUIRED_EXTENSIONS_DIR,
  acquiredExtensionDisplayPath,
  type ExtensionRef,
  acceptedLockedCanonicalPath,
  WorkspaceMutations,
  isDesiredExtensionActive,
  type SkillExtensionRef,
  type PackRef,
  type HookExtensionRef,
  type KnowledgeExtensionRef,
  type RuleExtensionRef,
  type McpServerExtensionRef,
  type SubagentExtensionRef,
  type HookExtensionTarget,
  type KnowledgeExtensionTarget,
  type McpServerExtensionTarget,
  type RuleExtensionTarget,
  type SkillExtensionTarget,
  type SubagentExtensionTarget,
  type DesiredStateGraph,
  usableAcceptedCanonical,
} from "@agentxm/extension-management/unstable/workspace";
import {
  parseExtensionFqnParts,
  toExtensionTypePlural,
  type ExtensionName,
  type ExtensionType,
  type ExtensionTypePlural,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import {
  versionSatisfiesRange,
  type VersionRange,
} from "@agentxm/extension-model/unstable/version-constraints";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import type { RegistrySource } from "@agentxm/extension-model/unstable/sources/types";
import {
  resolveSource,
  SourceHostProviders,
  WorkspaceCatalog,
} from "@agentxm/extension-management/unstable/source-resolution";
import { Verbosity } from "@agentxm/extension-management/unstable/cli-flags";
import { CliRenderer } from "@agentxm/extension-management/unstable/cli-renderer";
import { SkillManager } from "@agentxm/extension-management/unstable/skills";
import {
  PackManager,
  expandPackInstallRefs,
  expandPackInstallRefsWithReleaseAge,
  type WorkspacePackDependencyResolver,
} from "@agentxm/extension-management/unstable/packs";
import { HookManager } from "@agentxm/extension-management/unstable/hooks";
import { KnowledgeManager } from "@agentxm/extension-management/unstable/knowledge";
import { RuleManager } from "@agentxm/extension-management/unstable/rules";
import { McpServerManager } from "@agentxm/extension-management/unstable/mcps";
import { SubagentManager } from "@agentxm/extension-management/unstable/subagents";
import {
  buildUninstallOperation,
  buildInstallOperation,
  targetFromRef,
  toLabel,
} from "@agentxm/extension-management/unstable/extensions";
import type { InstallExtensionCommandWorkflowActions } from "@agentxm/extension-management/unstable/extension-lifecycle";
import {
  operationPresentation,
  type JobStepArtifact,
  type JobStepArtifactTarget,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/extension-management/unstable/plan";
import {
  parseMinimumReleaseAge,
  normalizeReleaseAgeRecords,
} from "@agentxm/registry-protocol/unstable/registry/release-age-policy";
import { type ReleaseAgeEvaluation } from "@agentxm/extension-model/unstable/extensions/release-age";
import type { InstallPackCommandIntent } from "./intent.js";
import { parseRegistryInstallTarget } from "../../shared/registry-install-target.js";
import { makeRegistryLoginSuggestionResolver } from "../../shared/registry-login-suggestion.js";
import { makeWorkspaceRetentionPolicy } from "../../shared/workspace-retention-policy.js";
import { buildAtomicPackGraphStep, validatePackGraphPostcondition } from "../graph-transition.js";
import { buildPackMemberInstallStep } from "../member-install-step.js";
import { buildAggregateProjectionStep } from "../../shared/aggregate-projection-step.js";
import { toAppError } from "@agentxm/extension-management/unstable/app-error/conversions";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/** Raw handler args from the CLI parser. */
export interface InstallPackHandlerArgs {
  readonly source: string;
  readonly unattended?: boolean;
  readonly releaseAgeEvaluation?: ReleaseAgeEvaluation;
  readonly releaseAgeHoldbackBehavior?: "continue" | "preserve-or-block";
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
  readonly releaseAgeEvaluation?: ReleaseAgeEvaluation;
  readonly releaseAgeHoldbackBehavior?: "continue" | "preserve-or-block";
}

/** Source request for pack registry lookup. */
export interface PackSourceRequest {
  readonly source: RegistrySource;
  readonly owner: Handle;
  readonly packName: ExtensionName;
  readonly versionRange: Option.Option<VersionRange>;
  readonly sourceResolution?: string;
}

type InstallPackActions = InstallExtensionCommandWorkflowActions<
  InstallPackHandlerArgs,
  ParsedPackInstallArgs,
  PackSourceRequest,
  PackDiscoveryResult,
  InstallPackCommandIntent
>;

interface PackDiscoveryResult {
  readonly ref: PackRef;
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

type PackDependencyNameSets = {
  readonly skill: Set<string>;
  readonly "mcp-server": Set<string>;
  readonly subagent: Set<string>;
  readonly rule: Set<string>;
  readonly hook: Set<string>;
  readonly knowledge: Set<string>;
};

type PackDependencyTarget =
  | SkillExtensionTarget
  | McpServerExtensionTarget
  | SubagentExtensionTarget
  | RuleExtensionTarget
  | HookExtensionTarget
  | KnowledgeExtensionTarget;

interface DroppedPackDependency {
  readonly target: PackDependencyTarget;
}

const makePackDependencyNameSets = (): PackDependencyNameSets => ({
  skill: new Set<string>(),
  "mcp-server": new Set<string>(),
  subagent: new Set<string>(),
  rule: new Set<string>(),
  hook: new Set<string>(),
  knowledge: new Set<string>(),
});

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
      case "mcp-server":
        names["mcp-server"].add(ref.server.name);
        break;
      case "subagent":
        names.subagent.add(ref.subagent.name);
        break;
      case "rule":
        names.rule.add(ref.rule.name);
        break;
      case "hook":
        names.hook.add(ref.hook.name);
        break;
      case "knowledge":
        names.knowledge.add(ref.knowledge.name);
        break;
    }
  }

  return names;
};

const collectDroppedPackDependencyTargets = (args: {
  readonly graph: DesiredStateGraph;
  readonly replacingPackIdentity: string;
  readonly nextDependencies: PackDependencyNameSets;
}): ReadonlyArray<DroppedPackDependency> => {
  const droppedTargets: Array<DroppedPackDependency> = [];
  for (const node of args.graph.nodes) {
    if (node.type === "pack") continue;
    const belongedToReplacedPack = node.origins.some(
      (origin) => origin.type === "pack" && origin.pack === args.replacingPackIdentity,
    );
    if (!belongedToReplacedPack || args.nextDependencies[node.type].has(node.name)) continue;
    const retainedElsewhere = node.origins.some(
      (origin) =>
        origin.type === "settings" ||
        (origin.type === "pack" && origin.pack !== args.replacingPackIdentity),
    );
    if (!retainedElsewhere) {
      droppedTargets.push({
        target: { type: node.type, name: node.name },
      });
    }
  }

  return droppedTargets;
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

const registryPluralSegment = (type: ExtensionType): ExtensionTypePlural => {
  switch (type) {
    case "skill":
      return "skills";
    case "pack":
      return "packs";
    case "mcp-server":
      return "mcps";
    case "subagent":
      return "subagents";
    case "rule":
      return "rules";
    case "hook":
      return "hooks";
    case "knowledge":
      return "knowledge";
  }
};

const registrySourceArtifact = (args: {
  readonly ref: ExtensionRef;
  readonly scope: JobStepArtifact["scope"];
  readonly installedBefore: boolean;
}): JobStepArtifact => {
  const change =
    args.ref.refType === "workspace" ? "unchanged" : args.installedBefore ? "updated" : "created";
  const sourcePath =
    args.ref.refType === "workspace"
      ? args.ref.location
      : acquiredExtensionDisplayPath(
          args.scope === "project" ? ACQUIRED_EXTENSIONS_DIR : ".axm/workspace/agent_extensions",
          args.ref,
          registryPluralSegment(args.ref.type),
          args.ref.name,
        );
  return {
    path: sourcePath,
    scope: args.scope,
    ...(args.ref.refType === "registry" || args.ref.refType === "workspace"
      ? { version: args.ref.version }
      : {}),
    change,
    fileCount: 1,
    targets: [{ path: sourcePath, change }],
  };
};

const packInstallCoverage = (ref: ExtensionRef | undefined): "eligible" | "ineligible" => {
  switch (ref?.type) {
    case "skill":
    case "mcp-server":
    case "subagent":
    case "rule":
    case "hook":
      return "eligible";
    case "pack":
    case "knowledge":
    case undefined:
      return "ineligible";
  }
};

const registrySourcePath = (ref: ExtensionRef, scope: JobStepArtifact["scope"]): string =>
  ref.refType === "workspace"
    ? ref.location
    : acquiredExtensionDisplayPath(
        scope === "project" ? ACQUIRED_EXTENSIONS_DIR : ".axm/workspace/agent_extensions",
        ref,
        registryPluralSegment(ref.type),
        ref.name,
      );

const resolveMinimumReleaseAge = (
  ws: ServiceMap.Service.Shape<typeof WorkspaceMutations>,
  unattended: boolean,
): Effect.Effect<Option.Option<Duration.Duration>, AppError> =>
  Effect.gen(function* () {
    if (!unattended) return Option.none<Duration.Duration>();

    const minimumReleaseAge = yield* ws.getMinimumReleaseAge().pipe(Effect.mapError(toAppError));
    const minimumAge = parseMinimumReleaseAge(minimumReleaseAge);
    if (Option.isNone(minimumAge)) {
      return yield* makeAppError({
        code: "validation",
        detail: `Invalid minimumReleaseAge "${minimumReleaseAge}"`,
        recover: "Use a duration such as 24h, 1440m, or 0s.",
      });
    }

    return minimumAge;
  });

export const InstallPackCommandWorkflowActions = Effect.gen(function* () {
  const sources = yield* SourceHostProviders;
  const catalog = yield* WorkspaceCatalog;
  const httpClient = yield* HttpClient.HttpClient;
  const ws = yield* WorkspaceMutations;
  const renderer = yield* CliRenderer;
  const fsSvc = yield* FileSystem.FileSystem;
  const agentRepo = yield* CodingAgentRepository;
  const packMgr = yield* PackManager;
  const pathSvc = yield* Path.Path;
  const skillMgr = yield* SkillManager;
  const ruleManager = yield* RuleManager;
  const hookManager = yield* HookManager;
  const knowledgeManager = yield* KnowledgeManager;
  const mcpServerMgr = yield* McpServerManager;
  const subagentMgr = yield* SubagentManager;
  const loginSuggestionsFor = yield* makeRegistryLoginSuggestionResolver;
  const verbosityOption = yield* Effect.serviceOption(Verbosity);
  const verbose = Option.match(verbosityOption, {
    onNone: () => false,
    onSome: (verbosity) => verbosity.isAtLeast("verbose"),
  });

  // Build a service layer to provide to inner effects that still require
  // services via the Effect context (e.g. resolveSource).
  const envLayer = Layer.mergeAll(
    Layer.succeed(SourceHostProviders, sources),
    Layer.succeed(WorkspaceCatalog, catalog),
    Layer.succeed(HttpClient.HttpClient, httpClient),
    Layer.succeed(WorkspaceMutations, ws),
    Layer.succeed(CliRenderer, renderer),
    Layer.succeed(FileSystem.FileSystem, fsSvc),
    Layer.succeed(Path.Path, pathSvc),
    Layer.succeed(CodingAgentRepository, agentRepo),
    Layer.succeed(PackManager, packMgr),
    Layer.succeed(SkillManager, skillMgr),
    Layer.succeed(McpServerManager, mcpServerMgr),
    Layer.succeed(SubagentManager, subagentMgr),
    Layer.succeed(RuleManager, ruleManager),
    Layer.succeed(HookManager, hookManager),
    Layer.succeed(KnowledgeManager, knowledgeManager),
  );

  // Assertion needed: strips service requirements (R) from inner effects.
  // PromptCancelled propagates at runtime but is erased here;
  // the top-level `run()` function handles it as a clean exit.
  const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provide(effect, envLayer);

  const scanWorkspaceAuthority = (pack: PackRef) =>
    Effect.gen(function* () {
      const graph = yield* ws.getDesiredStateGraph().pipe(Effect.mapError(toAppError));
      const packIdentity = `${pack.owner}/packs/${pack.name}`;
      const blockers: Array<SourceAuthorityBlockedFact> = [];
      const workspaceRefs = new Map<string, ExtensionRef>();

      const root = graph.nodes.find(
        (node) =>
          node.type === "pack" &&
          node.name === pack.name &&
          node.origins.some(
            (origin) =>
              origin.type === "settings" &&
              origin.source !== undefined &&
              isWorkspaceSourceLocator(origin.source),
          ),
      );
      if (root !== undefined) {
        const decision = evaluateSourceAuthority({
          target: { type: "pack", name: pack.name, identity: packIdentity },
          relationship: { kind: "root" },
          requested: {
            identity: `${pack.refType}:${packIdentity}`,
            workspace: pack.refType === "workspace",
          },
          configured: {
            identity: root.identity,
            workspace: root.identity.startsWith("workspace:"),
          },
        });
        if (decision.kind === "blocked") blockers.push(decision.fact);
      }

      const dependencies = Object.entries(pack.pack.dependencies).sort(([left], [right]) =>
        left.localeCompare(right),
      );
      for (const [fqn, constraint] of dependencies) {
        const parsed = parseExtensionFqnParts(fqn);
        if (parsed === undefined || parsed.type === "pack") continue;
        const desired = graph.nodes.find(
          (node) =>
            node.type === parsed.type &&
            node.name === parsed.name &&
            node.origins.some(
              (origin) =>
                origin.type === "settings" &&
                origin.source !== undefined &&
                isWorkspaceSourceLocator(origin.source),
            ),
        );
        if (desired === undefined) continue;

        const canonical = yield* provide(
          usableAcceptedCanonical({ workspace: ws, type: parsed.type, name: parsed.name }),
        );
        const targetIdentity = `${parsed.owner}/${toExtensionTypePlural(parsed.type)}/${parsed.name}`;
        const configuredVersion =
          Option.isSome(canonical) &&
          (canonical.value.ref.refType === "registry" ||
            canonical.value.ref.refType === "workspace")
            ? canonical.value.ref.version
            : undefined;
        const configured: NonNullable<SourceAuthorityInput["configured"]> = {
          identity: desired.identity,
          workspace: desired.identity.startsWith("workspace:"),
          ...(configuredVersion === undefined ? {} : { version: configuredVersion }),
          status: Option.isSome(canonical) ? canonical.value.observation.status : "missing",
        };
        const input: SourceAuthorityInput = {
          target: { type: parsed.type, name: parsed.name, identity: targetIdentity },
          relationship: { kind: "member" as const, root: packIdentity },
          requested: { identity: `registry:${targetIdentity}`, workspace: false },
          configured,
          requiredVersionRange: constraint,
        };
        const decision = evaluateSourceAuthority(input);
        if (decision.kind === "blocked") {
          blockers.push(decision.fact);
          continue;
        }
        if (decision.kind !== "workspace-satisfied") continue;

        if (Option.isNone(canonical)) {
          const unusable = evaluateSourceAuthority({
            ...input,
            configured: { ...configured, status: "wrong-origin" },
          });
          if (unusable.kind === "blocked") blockers.push(unusable.fact);
          continue;
        }
        const ref = canonical.value.ref;
        if (
          ref.refType !== "workspace" ||
          ref.type !== parsed.type ||
          ref.owner !== parsed.owner ||
          ref.name !== parsed.name
        ) {
          const mismatched = evaluateSourceAuthority({
            ...input,
            configured: { ...configured, status: "wrong-origin" },
          });
          if (mismatched.kind === "blocked") blockers.push(mismatched.fact);
          continue;
        }
        workspaceRefs.set(`${parsed.type}:${parsed.owner}/${parsed.name}`, ref);
      }

      const workspaceResolver: WorkspacePackDependencyResolver = ({ owner, type, name }) =>
        Effect.succeed(
          Option.match(Option.fromUndefinedOr(workspaceRefs.get(`${type}:${owner}/${name}`)), {
            onNone: () => ({ kind: "absent" as const }),
            onSome: (ref) => ({ kind: "selected" as const, ref }),
          }),
        );
      const fingerprint = [...workspaceRefs.entries()]
        .map(([key, ref]) =>
          ref.refType === "workspace" ? `${key}:${ref.version}:${ref.sourceHash}` : key,
        )
        .sort()
        .join("|");
      return { graph, blockers, workspaceResolver, fingerprint };
    });

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
              ...(args.releaseAgeEvaluation === undefined
                ? {}
                : { releaseAgeEvaluation: args.releaseAgeEvaluation }),
              ...(args.releaseAgeHoldbackBehavior === undefined
                ? {}
                : { releaseAgeHoldbackBehavior: args.releaseAgeHoldbackBehavior }),
            };
          }

          const owner = yield* ws
            .getConfiguredOwner()
            .pipe(Effect.mapError(toAppError))
            .pipe(
              Effect.flatMap(
                Option.match({
                  onNone: () =>
                    Effect.fail(
                      makeAppError({
                        code: "validation",
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
            ...(args.releaseAgeEvaluation === undefined
              ? {}
              : { releaseAgeEvaluation: args.releaseAgeEvaluation }),
            ...(args.releaseAgeHoldbackBehavior === undefined
              ? {}
              : { releaseAgeHoldbackBehavior: args.releaseAgeHoldbackBehavior }),
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
              const registryHosts = yield* ws
                .getRegistrySourceHosts()
                .pipe(Effect.mapError(toAppError));
              const fallbackSources = registryHosts
                .filter((host) => host.location.protocol === "file:")
                .map(
                  (host) =>
                    ({
                      type: "registry" as const,
                      name: host.name,
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

            const registryHosts = yield* ws
              .getRegistrySourceHosts()
              .pipe(Effect.mapError(toAppError));

            if (!resolvedRefs || resolvedRefs.length === 0) {
              const loginSuggestions = yield* loginSuggestionsFor(
                probes.map((probe) => probe.location),
              );
              return yield* makeAppError({
                code: "not_found",
                detail: `Pack "${req.packName}" not found in registry`,
                suggestions: [
                  {
                    description: "Verify the pack name and check available packs.",
                  },
                  ...loginSuggestions,
                ],
              });
            }

            if (verbose) {
              const diagnosticLines = [
                `Pack: ${req.owner}/packs/${req.packName}`,
                ...(req.sourceResolution !== undefined
                  ? [`Source resolution: ${req.sourceResolution}`]
                  : []),
                ...(probes.length > 0
                  ? [`Host resolution: ${probes.map(formatRegistryProbe).join("; ")}`]
                  : []),
                `Registry source: ${formatRegistrySourceLabel({ source: resolvedSource, registryHosts })}`,
                "Found pack",
              ];
              for (const line of diagnosticLines) {
                yield* renderer.info(line);
              }
            }

            return resolvedRefs.map((ref) => ({ ref }));
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
        const registryHosts = yield* ws.getRegistrySourceHosts().pipe(Effect.mapError(toAppError));
        const loginSuggestions = yield* loginSuggestionsFor(
          registryHosts.map((host) => host.location.href),
        );
        return yield* makeAppError({
          code: "not_found",
          detail: "No pack reference found",
          suggestions: loginSuggestions,
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
        ...(parsed.releaseAgeEvaluation === undefined
          ? {}
          : { releaseAgeEvaluation: parsed.releaseAgeEvaluation }),
        ...(parsed.releaseAgeHoldbackBehavior === undefined
          ? {}
          : { releaseAgeHoldbackBehavior: parsed.releaseAgeHoldbackBehavior }),
      };
    });

  const buildPlan = (intent: InstallPackCommandIntent) =>
    Effect.gen(function* () {
      const authority = yield* scanWorkspaceAuthority(intent.packToInstall);
      const packIdentity = `${intent.packToInstall.owner}/packs/${intent.packToInstall.name}`;
      if (authority.blockers.length > 0) {
        const conditionIds = authority.blockers.map((fact) => fact.id);
        const suggestions = authority.blockers
          .flatMap((fact) => fact.recovery)
          .filter(
            (suggestion, index, all) =>
              all.findIndex((candidate) => candidate.description === suggestion.description) ===
              index,
          );
        return {
          _tag: "Plan",
          name: "Install pack",
          description: Option.some(
            "Workspace source authority prevents this pack graph transition.",
          ),
          jobs: [
            {
              concurrency: 1,
              steps: [
                {
                  readiness: "error",
                  label: packIdentity,
                  errorMessage: authority.blockers.map((fact) => fact.detail).join("; "),
                  blockingConditionIds: conditionIds,
                  artifact: {
                    path: "pack graph",
                    scope: ws.scope,
                    change: "unchanged",
                    fileCount: 0,
                  },
                },
              ],
            },
          ],
          presentation: operationPresentation(
            { imperative: "install", past: "Installed", gerund: "Installing" },
            "pack",
          ),
          riskConditions: authority.blockers.map((fact) => ({
            level: "blocked" as const,
            id: fact.id,
            detail: fact.detail,
            errorCode: "conflict" as const,
          })),
          failureSuggestions: suggestions,
        } satisfies Plan;
      }
      const minimumReleaseAge = yield* resolveMinimumReleaseAge(ws, intent.unattended ?? false);
      const supportedDependencyTypes = [
        "skill",
        "mcp-server",
        "subagent",
        "rule",
        "hook",
        "knowledge",
      ] as const;
      const expansion =
        intent.releaseAgeEvaluation === undefined
          ? {
              kind: "selected" as const,
              refs: yield* expandPackInstallRefs({
                pack: intent.packToInstall,
                supportedDependencyTypes,
                sources,
                minimumReleaseAge,
                workspaceResolver: authority.workspaceResolver,
                ...(intent.dependencyResolver === undefined
                  ? {}
                  : { dependencyResolver: intent.dependencyResolver }),
              }),
              holdbacks: [],
              bypasses: [],
            }
          : yield* expandPackInstallRefsWithReleaseAge({
              pack: intent.packToInstall,
              supportedDependencyTypes,
              sources,
              releaseAgeEvaluation: intent.releaseAgeEvaluation,
              workspaceResolver: authority.workspaceResolver,
              ...(intent.dependencyResolver === undefined
                ? {}
                : { dependencyResolver: intent.dependencyResolver }),
            });
      const releaseAge =
        intent.releaseAgeEvaluation === undefined
          ? undefined
          : {
              evaluatedAt: DateTime.formatIso(intent.releaseAgeEvaluation.evaluatedAt),
              holdbacks: normalizeReleaseAgeRecords(expansion.holdbacks),
              bypasses: normalizeReleaseAgeRecords(expansion.bypasses),
            };
      if (expansion.kind === "policy_held") {
        let preservable = false;
        if (intent.releaseAgeHoldbackBehavior === "preserve-or-block") {
          const graph = yield* ws.getDesiredStateGraph().pipe(Effect.mapError(toAppError));
          if (graph.complete) {
            const currentPack = yield* provide(
              usableAcceptedCanonical({
                workspace: ws,
                type: "pack",
                name: intent.packToInstall.pack.name,
              }),
            );
            if (
              Option.isSome(currentPack) &&
              currentPack.value.ref.refType === "registry" &&
              currentPack.value.ref.owner === intent.packToInstall.owner &&
              currentPack.value.ref.name === intent.packToInstall.name &&
              (Option.isNone(intent.versionRange) ||
                versionSatisfiesRange(currentPack.value.ref.version, intent.versionRange.value))
            ) {
              const packIdentity = `${intent.packToInstall.owner}/packs/${intent.packToInstall.name}`;
              const nodes = graph.nodes.filter(
                (node) =>
                  (node.type === "pack" && node.name === intent.packToInstall.pack.name) ||
                  node.origins.some(
                    (origin) => origin.type === "pack" && origin.pack === packIdentity,
                  ),
              );
              const usable = yield* Effect.forEach(nodes, (node) =>
                provide(
                  usableAcceptedCanonical({
                    workspace: ws,
                    type: node.type,
                    name: node.name,
                  }),
                ).pipe(Effect.map(Option.isSome)),
              );
              preservable = usable.every((value) => value);
            }
          }
        }
        const blocked = intent.releaseAgeHoldbackBehavior === "preserve-or-block" && !preservable;
        return {
          _tag: "Plan",
          name: "Install pack",
          description: Option.some(
            blocked
              ? "The selected pack graph includes a release held by the minimum release age"
              : "The current pack graph is unchanged while a required release ages",
          ),
          jobs: [],
          ...(releaseAge === undefined ? {} : { releaseAge }),
          ...(blocked
            ? {
                riskConditions: [
                  {
                    level: "blocked" as const,
                    id: "minimum-release-age",
                    detail: "The selected pack graph has no complete usable accepted resolution.",
                    errorCode: "conflict" as const,
                  },
                ],
              }
            : {}),
        } satisfies Plan;
      }
      const refs = expansion.refs;
      const graph = authority.graph;
      const currentPackNode = graph.nodes.find(
        (node) => node.type === "pack" && node.name === intent.packToInstall.pack.name,
      );
      const preservedPackActivation = currentPackNode?.enabled ?? true;
      // Installing is also the recovery path for a configured pack whose
      // canonical manifest or accepted resolution is unavailable. Preserve
      // fail-closed cleanup by suppressing dropped-member removal until the
      // pre-install graph is complete.
      const existingPack = graph.complete
        ? graph.nodes.find(
            (node) => node.type === "pack" && node.name === intent.packToInstall.pack.name,
          )
        : undefined;

      const retentionPolicy = makeWorkspaceRetentionPolicy(ws);

      const installSteps = yield* Effect.forEach(
        refs,
        (ref): Effect.Effect<PlannedJobStep, never> =>
          ref.type === "pack"
            ? Effect.succeed(
                buildInstallOperation<PackRef>(packMgr, {
                  ref,
                  versionRange: intent.versionRange,
                  ...(intent.forceCanonical === true ? { force: true } : {}),
                  installedBefore: graph.complete
                    ? packMgr.isInstalled({
                        target: { type: "pack", name: ref.pack.name, owner: ref.owner },
                      })
                    : Effect.succeed(false),
                  buildArtifact: ({ installedBefore }) =>
                    Effect.succeed(
                      registrySourceArtifact({ ref, scope: ws.scope, installedBefore }),
                    ),
                }),
              )
            : buildPackMemberInstallStep({ ref, graphComplete: graph.complete }).pipe(provide),
        { concurrency: 1 },
      );

      const nextDependencies = collectResolvedDependencyNames(refs);
      const unresolvedDroppedTargets =
        existingPack === undefined
          ? []
          : collectDroppedPackDependencyTargets({
              graph,
              replacingPackIdentity: existingPack.identity,
              nextDependencies,
            });
      const droppedTargets = yield* Effect.forEach(
        unresolvedDroppedTargets,
        (dropped) =>
          acceptedLockedCanonicalPath({
            workspace: ws,
            type: dropped.target.type,
            name: dropped.target.name,
          }).pipe(
            provide,
            Effect.map((canonicalPath) => ({
              ...dropped,
              sourcePath: Option.match(canonicalPath, {
                onNone: () => toLabel(dropped.target),
                onSome: (value) => pathSvc.relative(ws.baseDir, value),
              }),
            })),
          ),
        { concurrency: 1 },
      );
      const uninstallSteps = droppedTargets.map(({ target }): PlannedJobStep => {
        if (target.type === "skill") {
          return buildUninstallOperation<SkillExtensionRef>(skillMgr, retentionPolicy, {
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

        if (target.type === "rule") {
          return buildUninstallOperation<RuleExtensionRef>(ruleManager, retentionPolicy, {
            target,
            skipProjections: true,
          });
        }

        if (target.type === "hook") {
          return buildUninstallOperation<HookExtensionRef>(hookManager, retentionPolicy, {
            target,
            skipProjections: true,
          });
        }

        if (target.type === "knowledge") {
          return buildUninstallOperation<KnowledgeExtensionRef>(knowledgeManager, retentionPolicy, {
            target,
            skipProjections: true,
          });
        }

        return {
          label: toLabel(target),
          readiness: "error",
          errorMessage: "Unsupported dependency type",
        };
      });

      const resolvedTargets = refs.map(targetFromRef);
      const expectedMemberActivation = (target: PackDependencyTarget): boolean => {
        const currentNode = graph.nodes.find(
          (node) => node.type === target.type && node.name === target.name,
        );
        const preservedOrigins = (currentNode?.origins ?? []).filter(
          (origin) =>
            origin.type !== "pack" ||
            origin.pack.replace(/^workspace:/, "") !== packIdentity.replace(/^workspace:/, ""),
        );
        return isDesiredExtensionActive([
          ...preservedOrigins,
          { type: "pack", enabled: preservedPackActivation },
        ]);
      };
      const artifactTargets: ReadonlyArray<JobStepArtifactTarget> = [
        ...refs.map((ref): JobStepArtifactTarget => {
          const target = targetFromRef(ref);
          if (ref.refType === "workspace") {
            return { path: ref.location, change: "unchanged" };
          }
          return {
            path: registrySourcePath(ref, ws.scope),
            change: graph.nodes.some(
              (node) => node.type === target.type && node.name === target.name,
            )
              ? "updated"
              : "created",
          };
        }),
        ...droppedTargets.map((dropped): JobStepArtifactTarget => ({
          path: dropped.sourcePath,
          change: "removed",
        })),
      ];
      const projectionStep =
        intent.deferProjections === true
          ? Option.none<PlannedJobStep>()
          : yield* buildAggregateProjectionStep({
              types: new Set([
                ...refs.map((ref) => ref.type),
                ...droppedTargets.map(({ target }) => target.type),
              ]),
            }).pipe(provide);
      const graphStep = yield* buildAtomicPackGraphStep({
        label: packIdentity,
        message: `Installed ${packIdentity} and ${refs.length - 1} pack member${refs.length === 2 ? "" : "s"}`,
        artifact: {
          path: "pack graph",
          scope: ws.scope,
          change: "updated",
          fileCount: refs.length + droppedTargets.length,
          targets: artifactTargets,
        },
        children: [
          ...installSteps.map((step, index) => ({
            step,
            coverage: packInstallCoverage(refs[index]),
          })),
          ...uninstallSteps.map((step) => ({ step, coverage: "ineligible" as const })),
          ...Option.toArray(projectionStep).map((step) => ({
            step,
            coverage: "ineligible" as const,
          })),
        ],
        preTransition: Effect.gen(function* () {
          const refreshed = yield* scanWorkspaceAuthority(intent.packToInstall);
          if (refreshed.blockers.length > 0 || refreshed.fingerprint !== authority.fingerprint) {
            return yield* makeAppError({
              code: "conflict",
              detail: "Workspace source authority changed before the pack transition applied",
              suggestions:
                refreshed.blockers.length === 0
                  ? [{ description: "Rerun the command to resolve a fresh pack candidate." }]
                  : refreshed.blockers.flatMap((fact) => fact.recovery),
            });
          }
        }),
        validate: validatePackGraphPostcondition({
          requiredPacks: [
            {
              name: intent.packToInstall.name,
              identity: packIdentity,
              enabled: preservedPackActivation,
            },
          ],
          requiredMembers: resolvedTargets.flatMap((target) =>
            target.type === "pack"
              ? []
              : [
                  {
                    type: target.type,
                    name: target.name,
                    packIdentity,
                    enabled: expectedMemberActivation(target),
                  },
                ],
          ),
          absent: droppedTargets.map(({ target }) => target),
        }),
      }).pipe(Effect.provideService(WorkspaceMutations, ws));

      yield* renderer.info("Pack activation:");
      yield* renderer.info(
        `  ${packIdentity}: preserve ${preservedPackActivation ? "enabled" : "disabled"} activation`,
      );
      yield* renderer.info("Pack graph transition:");
      for (const line of [
        ...installSteps.map((step) => `${step.label} (${step.readiness})`),
        ...droppedTargets.map(({ target }) => `remove ${target.type}: ${target.name}`),
      ]) {
        yield* renderer.info(`  ${line}`);
      }

      return {
        _tag: "Plan",
        name: "Install pack",
        description: Option.none(),
        presentation: operationPresentation(
          { imperative: "install", past: "Installed", gerund: "Installing" },
          "pack",
        ),
        jobs: [{ concurrency: 1, steps: [graphStep] }],
        ...(releaseAge === undefined ? {} : { releaseAge }),
      } satisfies Plan;
    }).pipe(Effect.mapError(toAppError));

  return {
    parseArgs,
    resolveSourceRequests,
    discoverRefs,
    finalizeIntent,
    buildPlan,
  };
}).pipe(Effect.map((actions): InstallPackActions => actions));
