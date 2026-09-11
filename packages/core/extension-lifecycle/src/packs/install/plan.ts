/**
 * Installing a pack.
 *
 * A pack install is a graph transition, not a package copy: the pack's own
 * package, every member its manifest resolves to, and every member the
 * previous graph owned and this one drops all change together. Workspace
 * source authority decides whether a locally-authored package may stand in
 * for a declared member, the minimum-release-age policy decides whether a
 * held-back release preserves the current graph or blocks, and the transition
 * is refused if the authority it was planned against changed underneath it.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as DateTime from "effect/DateTime";
import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";

import {
  HookManager,
  KnowledgeManager,
  McpServerManager,
  PackManager,
  RuleManager,
  SkillManager,
  SubagentManager,
  buildInstallOperation,
  buildUninstallOperation,
  targetFromRef,
  toLabel,
} from "@agentxm/extension-materialization";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { PackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import {
  parseExtensionFqnParts,
  toExtensionTypePlural,
  type ExtensionName,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import type { ReleaseAgeEvaluation } from "@agentxm/extension-model/unstable/extensions/release-age";
import type { RegistrySource } from "@agentxm/extension-model/unstable/sources/types";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import {
  versionSatisfiesRange,
  type VersionRange,
} from "@agentxm/extension-model/unstable/version-constraints";
import {
  evaluateSourceAuthority,
  normalizeReleaseAgeRecords,
  parseMinimumReleaseAge,
  type SourceAuthorityBlockedFact,
  type SourceAuthorityInput,
  type WorkspacePackDependencyResolver,
} from "@agentxm/extension-resolution";
import {
  SourceHostProviders,
  resolveSource,
  sourceResolutionFailureCategory,
  type SourceResolutionFailure,
} from "@agentxm/extension-sources";
import {
  operationPresentation,
  type JobStepArtifactTarget,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import {
  WorkspaceMutations,
  acceptedLockedCanonicalPath,
  isDesiredExtensionActive,
  usableAcceptedCanonical,
  type HookExtensionTarget,
  type KnowledgeExtensionTarget,
  type McpServerExtensionTarget,
  type RuleExtensionTarget,
  type SkillExtensionTarget,
  type DesiredStateGraph,
  type SubagentExtensionTarget,
} from "@agentxm/workspace-state";

import type { ExtensionLifecycleFailed } from "../../errors.js";
import { lifecycleStepFailure } from "../../step-failure.js";
import { buildAggregateProjectionStep } from "../../install/aggregate-projection-step.js";
import { parseRegistryInstallTarget } from "../../install/registry-install-target.js";
import { registryLoginSuggestions } from "../../install/registry-login-suggestion.js";
import {
  formatRegistryProbe,
  sourceFailureDetail,
  type RegistryLookupProbe,
} from "../../install/registry-source-resolution.js";
import {
  installRefused,
  type InstallStepRequirements,
  type PackInstallIntent,
  type ResolveInstallRequirements,
} from "../../install/vocabulary.js";
import { expandPackInstallRefs, expandPackInstallRefsWithReleaseAge } from "../expansion.js";
import { buildAtomicPackGraphStep, validatePackGraphPostcondition } from "../graph-transition.js";
import { buildPackMemberInstallStep } from "../member-install-step.js";
import { registrySourceArtifact, registrySourcePath } from "../artifact.js";
import { makeWorkspaceRetentionPolicy } from "../../uninstall/retention-policy.js";

/** A pack install request after grammar parsing, before anything is discovered. */
export interface ParsedPackInstallRequest {
  readonly owner: Handle;
  readonly packName: ExtensionName;
  readonly versionRange: Option.Option<VersionRange>;
  readonly resolvedInput: string;
  readonly inputKind: "name-input" | "name-input-with-version" | "registry-pattern-input";
  readonly sourceResolution?: string;
  readonly unattended: boolean;
  readonly nonInteractive: boolean;
  readonly releaseAgeEvaluation?: ReleaseAgeEvaluation;
  readonly releaseAgeHoldbackBehavior?: "continue" | "preserve-or-block";
}

/** One pack registry lookup. */
export interface PackSourceRequest {
  readonly source: RegistrySource;
  readonly owner: Handle;
  readonly packName: ExtensionName;
  readonly versionRange: Option.Option<VersionRange>;
  readonly sourceResolution?: string;
}

/** A discovered pack ref and the registry hosts that were consulted for it. */
export interface PackDiscovery {
  readonly ref: PackRef;
  readonly probes: ReadonlyArray<RegistryLookupProbe>;
  readonly registrySourceLabel: string;
}

const isRemoteReadNotImplemented = (error: SourceResolutionFailure): boolean => {
  const detail = sourceFailureDetail(error);
  return detail.includes("not implemented") || detail.includes("not yet supported");
};

const summarizeLookupFailure = (error: SourceResolutionFailure): string =>
  `${sourceFailureDetail(error)} (${sourceResolutionFailureCategory(error)})`;

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

/**
 * Members the replaced pack owned that the incoming graph no longer declares
 * and no other origin retains. Removing them is what makes a pack upgrade a
 * graph transition rather than an accumulation.
 */
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
    if (!retainedElsewhere) droppedTargets.push({ target: { type: node.type, name: node.name } });
  }
  return droppedTargets;
};

const formatRegistrySourceLabel = (args: {
  readonly source: RegistrySource;
  readonly registryHosts: ReadonlyArray<{ readonly name: string; readonly location: URL }>;
}): string => {
  const matched = args.registryHosts.find(
    (host) => host.location.href === args.source.location.href,
  );
  return matched === undefined
    ? args.source.location.href
    : `${matched.name} (${matched.location.href})`;
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

const resolveMinimumReleaseAge = (
  unattended: boolean,
): Effect.Effect<Option.Option<Duration.Duration>, ExtensionLifecycleFailed, WorkspaceMutations> =>
  Effect.gen(function* () {
    if (!unattended) return Option.none<Duration.Duration>();
    const ws = yield* WorkspaceMutations;
    const minimumReleaseAge = yield* ws.getMinimumReleaseAge().pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "internal",
          detail: "Minimum release age could not be read",
          cause,
        }),
      ),
    );
    const minimumAge = parseMinimumReleaseAge(minimumReleaseAge);
    if (Option.isNone(minimumAge)) {
      return yield* installRefused({
        category: "validation",
        detail: `Invalid minimumReleaseAge "${minimumReleaseAge}"`,
        recover: "Use a duration such as 24h, 1440m, or 0s.",
      });
    }
    return minimumAge;
  });

const readDesiredGraph = Effect.gen(function* () {
  const ws = yield* WorkspaceMutations;
  return yield* ws
    .getDesiredStateGraph()
    .pipe(
      Effect.mapError((cause) =>
        installRefused({ category: "internal", detail: "Desired state could not be read", cause }),
      ),
    );
});

/**
 * Which declared members a locally-authored workspace package may satisfy,
 * and which configured sources refuse to be replaced by the registry. The
 * fingerprint identifies the exact authority this plan was built against, so
 * the transition can refuse a candidate that went stale.
 */
export interface WorkspaceAuthorityScan {
  readonly graph: DesiredStateGraph;
  readonly blockers: ReadonlyArray<SourceAuthorityBlockedFact>;
  readonly workspaceResolver: WorkspacePackDependencyResolver;
  readonly fingerprint: string;
}

const scanWorkspaceAuthority: (
  pack: PackRef,
) => Effect.Effect<WorkspaceAuthorityScan, ExtensionLifecycleFailed, InstallStepRequirements> =
  Effect.fn("InstallExtensions.scanWorkspaceAuthority")(function* (pack: PackRef) {
    const ws = yield* WorkspaceMutations;
    const graph = yield* readDesiredGraph;
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

      const canonical = yield* usableAcceptedCanonical({
        workspace: ws,
        type: parsed.type,
        name: parsed.name,
      }).pipe(
        Effect.mapError((cause) =>
          installRefused({
            category: "internal",
            detail: `Accepted canonical content for ${parsed.name} could not be inspected`,
            cause,
          }),
        ),
      );
      const targetIdentity = `${parsed.owner}/${toExtensionTypePlural(parsed.type)}/${parsed.name}`;
      const configuredVersion =
        Option.isSome(canonical) &&
        (canonical.value.ref.refType === "registry" || canonical.value.ref.refType === "workspace")
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

/** What a pack install command supplies before anything is parsed. */
export interface PackInstallArgs {
  readonly source: string;
  readonly unattended?: boolean;
  readonly nonInteractive: boolean;
  readonly releaseAgeEvaluation?: ReleaseAgeEvaluation;
  readonly releaseAgeHoldbackBehavior?: "continue" | "preserve-or-block";
}

/** Read the pack source grammar: which owner, which pack, which range. */
export const parsePackInstallRequest: (
  args: PackInstallArgs,
) => Effect.Effect<ParsedPackInstallRequest, ExtensionLifecycleFailed, ResolveInstallRequirements> =
  Effect.fn("InstallExtensions.parsePackRequest")(function* (args: PackInstallArgs) {
    const ws = yield* WorkspaceMutations;
    const trimmed = args.source.trim();
    const parsed = parseRegistryInstallTarget(trimmed, {
      expectedType: "pack",
      allowBareName: true,
      allowBareVersionRange: true,
    });

    if (Result.isFailure(parsed)) {
      switch (parsed.failure.kind) {
        case "wrong-type":
          return yield* installRefused({
            category: "validation",
            detail: "Pack source must include /packs/ segment",
            suggestions: [
              {
                description:
                  "Use @owner/packs/pack-name format. The /packs/ segment distinguishes packs from skills.",
              },
            ],
          });
        case "missing-name":
          return yield* installRefused({
            category: "not_found",
            detail: "Pack source must include a pack name",
            suggestions: [{ description: "Use @owner/packs/pack-name format." }],
          });
        default:
          return yield* installRefused({
            category: "usage",
            detail: "Packs can only be installed from a registry",
            suggestions: [
              {
                description:
                  "Use @owner/packs/pack-name or just pack-name (resolved to default owner).",
              },
            ],
          });
      }
    }

    const policy = {
      unattended: args.unattended ?? false,
      nonInteractive: args.nonInteractive,
      ...(args.releaseAgeEvaluation === undefined
        ? {}
        : { releaseAgeEvaluation: args.releaseAgeEvaluation }),
      ...(args.releaseAgeHoldbackBehavior === undefined
        ? {}
        : { releaseAgeHoldbackBehavior: args.releaseAgeHoldbackBehavior }),
    } as const;

    if (parsed.success.kind === "registry") {
      return {
        inputKind: "registry-pattern-input" as const,
        owner: parsed.success.owner,
        packName: parsed.success.name,
        versionRange: Option.fromUndefinedOr(parsed.success.versionRange),
        resolvedInput: trimmed,
        ...policy,
      };
    }

    const owner = yield* ws.getConfiguredOwner().pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "internal",
          detail: "Configured workspace owner could not be read",
          cause,
        }),
      ),
      Effect.flatMap(
        Option.match({
          onNone: () =>
            Effect.fail(
              installRefused({
                category: "validation",
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
      ...policy,
    };
  });

/** Resolve the registry the parsed pack request names. */
export const resolvePackSourceRequest: (
  request: ParsedPackInstallRequest,
) => Effect.Effect<PackSourceRequest, ExtensionLifecycleFailed, ResolveInstallRequirements> =
  Effect.fn("InstallExtensions.resolvePackSource")(function* (request: ParsedPackInstallRequest) {
    const source = yield* resolveSource(request.resolvedInput).pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "validation",
          detail: `Invalid source: ${cause.message}`,
          suggestions: [{ description: "Use @owner/packs/pack-name or just pack-name." }],
          cause,
        }),
      ),
    );
    if (source.type !== "registry") {
      return yield* installRefused({
        category: "usage",
        detail: "Packs can only be installed from a registry",
        suggestions: [{ description: "Use a registry source: @owner/packs/pack-name" }],
      });
    }
    return {
      source,
      owner: request.owner,
      packName: request.packName,
      versionRange: request.versionRange,
      ...(request.sourceResolution === undefined
        ? {}
        : { sourceResolution: request.sourceResolution }),
    };
  });

/**
 * Find the pack. When the first host cannot answer because remote reads are
 * unsupported, every configured `file://` registry is consulted in turn, and
 * every probe is recorded so the operator can see what was tried.
 */
export const discoverPackRef: (
  request: PackSourceRequest,
) => Effect.Effect<PackDiscovery, ExtensionLifecycleFailed, ResolveInstallRequirements> = Effect.fn(
  "InstallExtensions.discoverPack",
)(function* (request: PackSourceRequest) {
  const ws = yield* WorkspaceMutations;
  const sources = yield* SourceHostProviders;
  const findWith = (candidate: RegistrySource) =>
    sources.find(candidate, {
      names: [request.packName],
      type: "pack",
      owner: Option.some(request.owner),
      versionRange: request.versionRange,
    });
  const probes: Array<RegistryLookupProbe> = [];

  const initialResult = yield* findWith(request.source).pipe(Effect.result);
  probes.push(
    initialResult._tag === "Success"
      ? {
          location: request.source.location.href,
          outcome: initialResult.success.length > 0 ? "matched" : "not-found",
          reason: Option.none(),
        }
      : {
          location: request.source.location.href,
          outcome: "error",
          reason: Option.some(summarizeLookupFailure(initialResult.failure)),
        },
  );

  let resolvedRefs: ReadonlyArray<PackRef> | undefined;
  let resolvedSource: RegistrySource = request.source;

  if (initialResult._tag === "Success" && initialResult.success.length > 0) {
    resolvedRefs = initialResult.success.filter((ref): ref is PackRef => ref.type === "pack");
  } else if (
    initialResult._tag === "Failure" &&
    isRemoteReadNotImplemented(initialResult.failure)
  ) {
    const registryHosts = yield* ws.getRegistrySourceHosts().pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "internal",
          detail: "Configured registry hosts could not be read",
          cause,
        }),
      ),
    );
    const fallbackSources = registryHosts
      .filter((host) => host.location.protocol === "file:")
      .map(
        (host) =>
          ({
            type: "registry" as const,
            name: host.name,
            location: host.location,
            owner: Option.some(request.owner),
          }) satisfies RegistrySource,
      );

    for (const fallbackSource of fallbackSources) {
      if (fallbackSource.location.href === request.source.location.href) continue;
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
              reason: Option.some(summarizeLookupFailure(fallbackResult.failure)),
            },
      );
      if (fallbackResult._tag === "Success" && fallbackResult.success.length > 0) {
        resolvedRefs = fallbackResult.success.filter((ref): ref is PackRef => ref.type === "pack");
        resolvedSource = fallbackSource;
        break;
      }
    }

    if (resolvedRefs === undefined) {
      return yield* installRefused({
        category: "network",
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
    return yield* installRefused({
      category: "network",
      detail: "Pack could not be fetched from registry",
      suggestions: [{ description: "Verify the pack name and registry configuration." }],
      cause: initialResult.failure,
    });
  }

  const registryHosts = yield* ws.getRegistrySourceHosts().pipe(
    Effect.mapError((cause) =>
      installRefused({
        category: "internal",
        detail: "Configured registry hosts could not be read",
        cause,
      }),
    ),
  );

  const ref = resolvedRefs?.[0];
  if (ref === undefined) {
    const loginSuggestions = yield* registryLoginSuggestions(probes.map((probe) => probe.location));
    return yield* installRefused({
      category: "not_found",
      detail: `Pack "${request.packName}" not found in registry`,
      suggestions: [
        { description: "Verify the pack name and check available packs." },
        ...loginSuggestions,
      ],
    });
  }

  return {
    ref,
    probes,
    registrySourceLabel: formatRegistrySourceLabel({ source: resolvedSource, registryHosts }),
  };
});

/** Render the probe evidence a discovery collected. */
export const packDiscoveryDiagnostics = (
  request: PackSourceRequest,
  discovery: PackDiscovery,
): ReadonlyArray<string> => [
  `Pack: ${request.owner}/packs/${request.packName}`,
  ...(request.sourceResolution === undefined
    ? []
    : [`Source resolution: ${request.sourceResolution}`]),
  ...(discovery.probes.length > 0
    ? [`Host resolution: ${discovery.probes.map(formatRegistryProbe).join("; ")}`]
    : []),
  `Registry source: ${discovery.registrySourceLabel}`,
  "Found pack",
];

/** Settle the pack this request installs. */
export const finalizePackInstallIntent = (
  request: ParsedPackInstallRequest,
  discovery: PackDiscovery,
): PackInstallIntent => ({
  packToInstall: discovery.ref,
  versionRange: request.versionRange,
  unattended: request.unattended,
  nonInteractive: request.nonInteractive,
  ...(request.releaseAgeEvaluation === undefined
    ? {}
    : { releaseAgeEvaluation: request.releaseAgeEvaluation }),
  ...(request.releaseAgeHoldbackBehavior === undefined
    ? {}
    : { releaseAgeHoldbackBehavior: request.releaseAgeHoldbackBehavior }),
});

/** Everything the pack graph transition reads and writes through. */
export type PackInstallRequirements =
  | InstallStepRequirements
  | ResolveInstallRequirements
  | SourceHostProviders
  | Path.Path
  | HookManager
  | KnowledgeManager
  | McpServerManager
  | PackManager
  | RuleManager
  | SkillManager
  | SubagentManager;

/** The single atomic closure a settled pack intent becomes. */
export const planPackInstall: (
  intent: PackInstallIntent,
) => Effect.Effect<
  Plan<InstallStepRequirements>,
  ExtensionLifecycleFailed,
  PackInstallRequirements
> = Effect.fn("InstallExtensions.planPack")(function* (intent: PackInstallIntent) {
  const ws = yield* WorkspaceMutations;
  const path = yield* Path.Path;
  const sources = yield* SourceHostProviders;
  const packManager = yield* PackManager;
  const skillManager = yield* SkillManager;
  const subagentManager = yield* SubagentManager;
  const ruleManager = yield* RuleManager;
  const hookManager = yield* HookManager;
  const knowledgeManager = yield* KnowledgeManager;
  const mcpServerManager = yield* McpServerManager;

  const packIdentity = `${intent.packToInstall.owner}/packs/${intent.packToInstall.name}`;
  const authority = yield* scanWorkspaceAuthority(intent.packToInstall);
  if (authority.blockers.length > 0) {
    const suggestions = authority.blockers
      .flatMap((fact) => fact.recovery)
      .filter(
        (suggestion, index, all) =>
          all.findIndex((candidate) => candidate.description === suggestion.description) === index,
      );
    return {
      _tag: "Plan",
      name: "Install pack",
      description: Option.some("Workspace source authority prevents this pack graph transition."),
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              readiness: "error",
              label: packIdentity,
              errorMessage: authority.blockers.map((fact) => fact.detail).join("; "),
              blockingConditionIds: authority.blockers.map((fact) => fact.id),
              artifact: { path: "pack graph", scope: ws.scope, change: "unchanged", fileCount: 0 },
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
    } satisfies Plan<InstallStepRequirements>;
  }

  const minimumReleaseAge = yield* resolveMinimumReleaseAge(intent.unattended ?? false);
  const supportedDependencyTypes = [
    "skill",
    "mcp-server",
    "subagent",
    "rule",
    "hook",
    "knowledge",
  ] as const;
  const expansion = yield* (
    intent.releaseAgeEvaluation === undefined
      ? expandPackInstallRefs({
          pack: intent.packToInstall,
          supportedDependencyTypes,
          sources,
          minimumReleaseAge,
          workspaceResolver: authority.workspaceResolver,
          ...(intent.dependencyResolver === undefined
            ? {}
            : { dependencyResolver: intent.dependencyResolver }),
        }).pipe(
          Effect.map((refs) => ({
            kind: "selected" as const,
            refs,
            holdbacks: [],
            bypasses: [],
          })),
        )
      : expandPackInstallRefsWithReleaseAge({
          pack: intent.packToInstall,
          supportedDependencyTypes,
          sources,
          releaseAgeEvaluation: intent.releaseAgeEvaluation,
          workspaceResolver: authority.workspaceResolver,
          ...(intent.dependencyResolver === undefined
            ? {}
            : { dependencyResolver: intent.dependencyResolver }),
        })
  ).pipe(
    Effect.mapError((cause) =>
      installRefused({
        category: "conflict",
        detail: `Pack ${packIdentity} could not be expanded`,
        cause,
      }),
    ),
  );
  const releaseAge =
    intent.releaseAgeEvaluation === undefined
      ? undefined
      : {
          evaluatedAt: DateTime.formatIso(intent.releaseAgeEvaluation.evaluatedAt),
          holdbacks: normalizeReleaseAgeRecords(expansion.holdbacks),
          bypasses: normalizeReleaseAgeRecords(expansion.bypasses),
        };

  if (expansion.kind === "policy_held") {
    // A held-back release preserves the current graph only when that graph is
    // complete and every one of its members is still usable; otherwise there
    // is nothing to preserve and the operation is blocked.
    let preservable = false;
    if (intent.releaseAgeHoldbackBehavior === "preserve-or-block") {
      const graph = yield* readDesiredGraph;
      if (graph.complete) {
        const currentPack = yield* usableAcceptedCanonical({
          workspace: ws,
          type: "pack",
          name: intent.packToInstall.pack.name,
        }).pipe(
          Effect.mapError((cause) =>
            installRefused({
              category: "internal",
              detail: "Accepted pack content could not be inspected",
              cause,
            }),
          ),
        );
        if (
          Option.isSome(currentPack) &&
          currentPack.value.ref.refType === "registry" &&
          currentPack.value.ref.owner === intent.packToInstall.owner &&
          currentPack.value.ref.name === intent.packToInstall.name &&
          (Option.isNone(intent.versionRange) ||
            versionSatisfiesRange(currentPack.value.ref.version, intent.versionRange.value))
        ) {
          const nodes = graph.nodes.filter(
            (node) =>
              (node.type === "pack" && node.name === intent.packToInstall.pack.name) ||
              node.origins.some((origin) => origin.type === "pack" && origin.pack === packIdentity),
          );
          const usable = yield* Effect.forEach(nodes, (node) =>
            usableAcceptedCanonical({ workspace: ws, type: node.type, name: node.name }).pipe(
              Effect.map(Option.isSome),
              Effect.mapError((cause) =>
                installRefused({
                  category: "internal",
                  detail: `Accepted content for ${node.name} could not be inspected`,
                  cause,
                }),
              ),
            ),
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
      presentation: operationPresentation(
        { imperative: "install", past: "Installed", gerund: "Installing" },
        "pack",
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
    } satisfies Plan<InstallStepRequirements>;
  }

  const refs = expansion.refs;
  const graph = authority.graph;
  const currentPackNode = graph.nodes.find(
    (node) => node.type === "pack" && node.name === intent.packToInstall.pack.name,
  );
  const preservedPackActivation = currentPackNode?.enabled ?? true;
  // Installing is also the recovery path for a configured pack whose canonical
  // manifest or accepted resolution is unavailable. Preserve fail-closed
  // cleanup by suppressing dropped-member removal until the pre-install graph
  // is complete.
  const existingPack = graph.complete ? currentPackNode : undefined;
  const retentionPolicy = makeWorkspaceRetentionPolicy(ws);

  const installSteps = yield* Effect.forEach(
    refs,
    (
      ref,
    ): Effect.Effect<
      PlannedJobStep<InstallStepRequirements>,
      never,
      | HookManager
      | KnowledgeManager
      | RuleManager
      | SkillManager
      | SubagentManager
      | WorkspaceMutations
    > =>
      ref.type === "pack"
        ? Effect.succeed(
            buildInstallOperation(packManager, {
              toStepFailure: lifecycleStepFailure,
              ref,
              versionRange: intent.versionRange,
              ...(intent.forceCanonical === true ? { force: true } : {}),
              installedBefore: graph.complete
                ? packManager.isInstalled({
                    target: { type: "pack", name: ref.pack.name, owner: ref.owner },
                  })
                : Effect.succeed(false),
              buildArtifact: ({ installedBefore }) =>
                Effect.succeed(registrySourceArtifact({ ref, scope: ws.scope, installedBefore })),
            }),
          )
        : buildPackMemberInstallStep({
            ref,
            graphComplete: graph.complete,
            nonInteractive: intent.nonInteractive,
          }),
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
        Effect.map((canonicalPath) => ({
          ...dropped,
          sourcePath: Option.match(canonicalPath, {
            onNone: () => toLabel(dropped.target),
            onSome: (value) => path.relative(ws.baseDir, value),
          }),
        })),
        Effect.mapError((cause) =>
          installRefused({
            category: "internal",
            detail: `Accepted canonical path for ${dropped.target.name} could not be read`,
            cause,
          }),
        ),
      ),
    { concurrency: 1 },
  );

  const uninstallSteps = droppedTargets.map(
    ({ target }): PlannedJobStep<InstallStepRequirements> => {
      switch (target.type) {
        case "skill":
          return buildUninstallOperation(skillManager, retentionPolicy, {
            toStepFailure: lifecycleStepFailure,
            target,
          });
        case "mcp-server":
          return buildUninstallOperation(mcpServerManager, retentionPolicy, {
            toStepFailure: lifecycleStepFailure,
            target,
          });
        case "subagent":
          return buildUninstallOperation(subagentManager, retentionPolicy, {
            toStepFailure: lifecycleStepFailure,
            target,
          });
        case "rule":
          return buildUninstallOperation(ruleManager, retentionPolicy, {
            toStepFailure: lifecycleStepFailure,
            target,
            skipProjections: true,
          });
        case "hook":
          return buildUninstallOperation(hookManager, retentionPolicy, {
            toStepFailure: lifecycleStepFailure,
            target,
            skipProjections: true,
          });
        case "knowledge":
          return buildUninstallOperation(knowledgeManager, retentionPolicy, {
            toStepFailure: lifecycleStepFailure,
            target,
            skipProjections: true,
          });
      }
    },
  );

  const resolvedTargets = refs.map(targetFromRef);
  // A member's activation survives a pack replacement: what the incoming pack
  // decides is combined with every origin the member still has.
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
      if (ref.refType === "workspace") return { path: ref.location, change: "unchanged" };
      return {
        path: registrySourcePath(ref, ws.scope),
        change: graph.nodes.some((node) => node.type === target.type && node.name === target.name)
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
      ? Option.none<PlannedJobStep<InstallStepRequirements>>()
      : yield* buildAggregateProjectionStep({
          types: new Set([
            ...refs.map((ref) => ref.type),
            ...droppedTargets.map(({ target }) => target.type),
          ]),
        });
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
    // The plan was built against one workspace authority; if that authority
    // moved, this candidate describes a decision that is no longer available.
    preTransition: Effect.gen(function* () {
      const refreshed = yield* scanWorkspaceAuthority(intent.packToInstall);
      if (refreshed.blockers.length > 0 || refreshed.fingerprint !== authority.fingerprint) {
        return yield* installRefused({
          category: "conflict",
          detail: "Workspace source authority changed before the pack transition applied",
          suggestions:
            refreshed.blockers.length === 0
              ? [{ description: "Rerun the command to resolve a fresh pack candidate." }]
              : refreshed.blockers.flatMap((fact) => fact.recovery),
        });
      }
    }).pipe(Effect.asVoid),
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
  });

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
  } satisfies Plan<InstallStepRequirements>;
});
