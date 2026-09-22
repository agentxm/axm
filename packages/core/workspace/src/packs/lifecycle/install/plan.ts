import { buildReconciliationClosure } from "../../../reconciliation/index.js";
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
import * as FileSystem from "effect/FileSystem";
import {
  DesiredStateReader,
  SettingsReader,
  WorkspaceLocation,
} from "../../../desired-state/index.js";

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
} from "../../../materialization/index.js";
import {
  buildInstallOperation,
  buildUninstallOperation,
  targetFromRef,
  toLabel,
} from "../../../reconciliation/index.js";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { PackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import {
  parseExtensionFqnParts,
  packMemberRegistrySource,
  packMemberVersionRange,
  toExtensionTypePlural,
  type ExtensionName,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import type { ReleaseAgeEvaluation } from "@agentxm/extension-model/unstable/extensions/release-age";
import type { RegistrySource, Source } from "@agentxm/extension-model/unstable/sources/types";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
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
} from "../../../resolution/index.js";
import {
  SourceHostProviders,
  resolveSource,
  sourceResolutionFailureCategory,
  type SourceResolutionFailure,
} from "../../../resolution/sources/index.js";
import {
  operationPresentation,
  type JobStepArtifactTarget,
  type Plan,
  type PlannedJobStep,
} from "../../../transitions/planning/index.js";
import {
  acceptedLockedCanonicalPath,
  acceptedLockedResolutionRef,
  isDesiredExtensionActive,
  usableAcceptedCanonical,
  type HookExtensionTarget,
  type KnowledgeExtensionTarget,
  type McpServerExtensionTarget,
  type RuleExtensionTarget,
  type SkillExtensionTarget,
  type DesiredStateGraph,
  type SubagentExtensionTarget,
} from "../../../desired-state/index.js";

import type { ExtensionLifecycleFailed } from "../../../lifecycle/errors.js";
import { lifecycleStepFailure } from "../../../lifecycle/step-failure.js";
import { buildAggregateProjectionStep } from "../../../lifecycle/install/aggregate-projection-step.js";
import { parseRegistryInstallTarget } from "../../../lifecycle/install/registry-install-target.js";
import { registryLoginSuggestions } from "../../../lifecycle/install/registry-login-suggestion.js";
import {
  formatRegistryProbe,
  sourceFailureDetail,
  type RegistryLookupProbe,
} from "../../../lifecycle/install/registry-source-resolution.js";
import {
  installRefused,
  type InstallStepRequirements,
  type PackInstallIntent,
  type ResolveInstallRequirements,
} from "../../../lifecycle/install/vocabulary.js";
import { expandPackInstallRefs, expandPackInstallRefsWithReleaseAge } from "../expansion.js";
import { validatePackGraphPostcondition } from "../graph-transition.js";
import { buildPackMemberInstallStep } from "../member-install-step.js";
import { registrySourceArtifact, registrySourcePath } from "../artifact.js";
import { exclusiveMemberRetentionPolicy } from "../../../reconciliation/index.js";

/** A pack install request after grammar parsing, before anything is discovered. */
export interface ParsedPackInstallRequest {
  readonly owner: Option.Option<Handle>;
  readonly packName: Option.Option<ExtensionName>;
  readonly versionRange: Option.Option<VersionRange>;
  readonly resolvedInput: string;
  readonly inputKind:
    "name-input" | "name-input-with-version" | "registry-pattern-input" | "source-locator-input";
  readonly sourceResolution?: string;
  readonly unattended: boolean;
  readonly nonInteractive: boolean;
  readonly releaseAgeEvaluation?: ReleaseAgeEvaluation;
  readonly releaseAgeHoldbackBehavior?: "continue" | "preserve-or-block";
}

/** One pack source lookup. */
export interface PackSourceRequest {
  readonly source: Source;
  readonly owner: Option.Option<Handle>;
  readonly packName: Option.Option<ExtensionName>;
  readonly versionRange: Option.Option<VersionRange>;
  readonly sourceResolution?: string;
}

/** A discovered pack ref and the registry hosts that were consulted for it. */
export interface PackDiscovery {
  readonly ref: PackRef;
  readonly probes: ReadonlyArray<RegistryLookupProbe>;
  readonly sourceLabel: string;
}

/** Discover every pack a locator exposes so the shared install selector can decide among them. */
export const discoverPackRefs: (
  request: PackSourceRequest,
) => Effect.Effect<ReadonlyArray<PackRef>, ExtensionLifecycleFailed, ResolveInstallRequirements> =
  Effect.fn("InstallExtensions.discoverPackRefs")(function* (request: PackSourceRequest) {
    if (request.source.type === "registry") {
      return [(yield* discoverPackRef(request)).ref];
    }
    const sources = yield* SourceHostProviders;
    const refs = yield* sources
      .find(request.source, {
        names: Option.toArray(request.packName),
        type: "pack",
        owner: request.owner,
        versionRange: request.versionRange,
      })
      .pipe(
        Effect.mapError((cause) =>
          installRefused({
            category:
              sourceResolutionFailureCategory(cause) === "not_found" ? "not_found" : "network",
            detail: "Pack source could not be read",
            cause,
          }),
        ),
      );
    return refs.filter((ref): ref is PackRef => ref.type === "pack");
  });

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

const failureDetail = (cause: unknown): string | undefined => {
  if (typeof cause !== "object" || cause === null || !("detail" in cause)) return undefined;
  const detail = Reflect.get(cause, "detail");
  return typeof detail === "string" && detail.length > 0 ? detail : undefined;
};

const resolveMinimumReleaseAge = (
  unattended: boolean,
): Effect.Effect<Option.Option<Duration.Duration>, ExtensionLifecycleFailed, SettingsReader> =>
  Effect.gen(function* () {
    if (!unattended) return Option.none<Duration.Duration>();
    const settings = yield* SettingsReader;
    const minimumReleaseAge = yield* settings.minimumReleaseAge.pipe(
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
  const desiredState = yield* DesiredStateReader;
  return yield* desiredState
    .graph()
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

const sourceAuthorityIdentity = (source: Source): string => {
  switch (source.type) {
    case "registry":
      return `registry:${source.location.href}`;
    case "local":
      return `path:${source.path}`;
    case "git":
      return `git:${source.url.href}#${Option.getOrElse(source.ref, () => "HEAD")}${Option.match(source.subPath, { onNone: () => "", onSome: (subPath) => `//${subPath}` })}`;
    case "workspace":
      return `workspace:${source.owner}/${toExtensionTypePlural(source.extensionType)}/${source.name}`;
  }
};

const scanWorkspaceAuthority: (
  pack: PackRef,
) => Effect.Effect<WorkspaceAuthorityScan, ExtensionLifecycleFailed, InstallStepRequirements> =
  Effect.fn("InstallExtensions.scanWorkspaceAuthority")(function* (pack: PackRef) {
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
    for (const [fqn, declaration] of dependencies) {
      const parsed = parseExtensionFqnParts(fqn);
      if (parsed === undefined || parsed.type === "pack") continue;
      const constraint = packMemberVersionRange(declaration);
      const declaredSource = packMemberRegistrySource(declaration);
      const existing = graph.nodes.find(
        (node) => node.type === parsed.type && node.name === parsed.name,
      );
      const existingPackOrigins = (existing?.origins ?? []).flatMap((origin) =>
        origin.type === "pack" && origin.pack.replace(/^workspace:/u, "") !== packIdentity
          ? [origin]
          : [],
      );
      const requestedAuthority =
        declaredSource === undefined
          ? sourceAuthorityIdentity(pack.source)
          : `registry:${declaredSource.url.href}`;
      const existingPackDeclarations = existingPackOrigins.map(
        (origin) =>
          `${origin.pack} declares ${fqn} from ${origin.sourceAuthority ?? origin.source}`,
      );
      if (existingPackDeclarations.length > 0) {
        const heldAuthorities = [
          ...new Set(existingPackOrigins.map((origin) => origin.sourceAuthority ?? origin.source)),
        ];
        if (heldAuthorities.some((authority) => authority !== requestedAuthority)) {
          const declarations = [
            ...existingPackDeclarations,
            `${packIdentity} declares ${fqn} from ${requestedAuthority}`,
          ];
          blockers.push({
            id: `pack-authority:member:${fqn}:source-conflict`,
            target: { type: parsed.type, name: parsed.name, identity: fqn },
            relationship: { kind: "member", root: packIdentity },
            requestedSource: requestedAuthority,
            configuredSource: heldAuthorities.join(", "),
            cause: "pack-source-conflict",
            detail: `Pack member ${fqn} is held by ${heldAuthorities.join(", ")}; conflicting declarations: ${declarations.join(", ")}`,
            requiredVersionRange: constraint,
            recovery: [
              {
                description:
                  "Remove or transition the conflicting Pack declaration before installing this Pack; Pack member authority has no override flag.",
              },
            ],
          });
          continue;
        }
      }

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
        requested: {
          identity:
            declaredSource === undefined
              ? `registry:${targetIdentity}`
              : `registry:${declaredSource.url.href}:${targetIdentity}`,
          workspace: false,
        },
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
    const settings = yield* SettingsReader;
    const trimmed = args.source.trim();
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
          return {
            inputKind: "source-locator-input" as const,
            owner: Option.none<Handle>(),
            packName: Option.none<ExtensionName>(),
            versionRange: Option.none<VersionRange>(),
            resolvedInput: trimmed,
            ...policy,
          };
      }
    }

    if (parsed.success.kind === "registry") {
      return {
        inputKind: "registry-pattern-input" as const,
        owner: Option.some(parsed.success.owner),
        packName: Option.some(parsed.success.name),
        versionRange: Option.fromUndefinedOr(parsed.success.versionRange),
        resolvedInput: trimmed,
        ...policy,
      };
    }

    const owner = yield* settings.owner.pipe(
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
      owner: Option.some(owner),
      packName: Option.some(parsed.success.name),
      versionRange,
      resolvedInput,
      sourceResolution: `${trimmed} -> ${resolvedInput}`,
      ...policy,
    };
  });

/** Resolve the source the parsed pack request names. */
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
  const settings = yield* SettingsReader;
  const sources = yield* SourceHostProviders;
  if (request.source.type !== "registry") {
    const refs = yield* sources
      .find(request.source, {
        names: Option.toArray(request.packName),
        type: "pack",
        owner: request.owner,
        versionRange: request.versionRange,
      })
      .pipe(
        Effect.mapError((cause) =>
          installRefused({
            category:
              sourceResolutionFailureCategory(cause) === "not_found" ? "not_found" : "network",
            detail: "Pack source could not be read",
            cause,
          }),
        ),
      );
    const packs = refs.filter((ref): ref is PackRef => ref.type === "pack");
    if (packs.length === 0) {
      return yield* installRefused({
        category: "not_found",
        detail: "No pack was found in the source",
      });
    }
    if (packs.length > 1) {
      return yield* installRefused({
        category: "usage",
        detail: `Pack source contains multiple packs: ${packs.map((ref) => ref.pack.name).join(", ")}`,
        suggestions: [{ description: "Use a source locator that selects one pack package." }],
      });
    }
    const [ref] = packs;
    if (ref === undefined) {
      return yield* installRefused({
        category: "not_found",
        detail: "No pack was found in the source",
      });
    }
    return { ref, probes: [], sourceLabel: printSourceParams(request.source) };
  }
  if (Option.isNone(request.owner) || Option.isNone(request.packName)) {
    return yield* installRefused({
      category: "validation",
      detail: "Registry pack source must identify an owner and pack name",
    });
  }
  const owner = request.owner.value;
  const packName = request.packName.value;
  const findWith = (candidate: RegistrySource) =>
    sources.find(candidate, {
      names: [packName],
      type: "pack",
      owner: Option.some(owner),
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
    const registryHosts = yield* settings.registrySourceHosts.pipe(
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
            owner: Option.some(owner),
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

  const registryHosts = yield* settings.registrySourceHosts.pipe(
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
      detail: `Pack "${packName}" not found in registry`,
      suggestions: [
        { description: "Verify the pack name and check available packs." },
        ...loginSuggestions,
      ],
    });
  }

  return {
    ref,
    probes,
    sourceLabel: formatRegistrySourceLabel({ source: resolvedSource, registryHosts }),
  };
});

/** Render the probe evidence a discovery collected. */
export const packDiscoveryDiagnostics = (
  request: PackSourceRequest,
  discovery: PackDiscovery,
): ReadonlyArray<string> => [
  `Pack: ${discovery.ref.owner}/packs/${discovery.ref.pack.name}`,
  ...(request.sourceResolution === undefined
    ? []
    : [`Source resolution: ${request.sourceResolution}`]),
  ...(discovery.probes.length > 0
    ? [`Host resolution: ${discovery.probes.map(formatRegistryProbe).join("; ")}`]
    : []),
  `Source: ${discovery.sourceLabel}`,
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
  const location = yield* WorkspaceLocation;
  const fs = yield* FileSystem.FileSystem;
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
              artifact: {
                path: "pack graph",
                scope: location.scope,
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
    Effect.mapError((cause) => {
      const memberFailure = failureDetail(cause);
      return installRefused({
        category: "conflict",
        detail: `Pack ${packIdentity} could not be expanded${memberFailure === undefined ? "" : `: ${memberFailure}`}`,
        cause,
      });
    }),
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
            usableAcceptedCanonical({ type: node.type, name: node.name }).pipe(
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
      | WorkspaceLocation
    > =>
      ref.type === "pack"
        ? Effect.succeed(
            buildInstallOperation(packManager, {
              toStepFailure: lifecycleStepFailure,
              ref,
              declaration: { name: ref.pack.name, versionRange: intent.versionRange },
              ...(intent.forceCanonical === true ? { force: true } : {}),
              installedBefore: graph.complete
                ? packManager.isInstalled({
                    target: { type: "pack", name: ref.pack.name, owner: ref.owner },
                  })
                : Effect.succeed(false),
              buildArtifact: ({ installedBefore }) =>
                Effect.succeed(
                  registrySourceArtifact({ ref, scope: location.scope, installedBefore }),
                ),
            }),
          )
        : buildPackMemberInstallStep({
            ref,
            graphComplete: graph.complete,
            nonInteractive: intent.nonInteractive,
          }),
    { concurrency: 1 },
  );

  const acceptedPackPath = yield* acceptedLockedCanonicalPath({
    type: "pack",
    name: intent.packToInstall.pack.name,
  }).pipe(
    Effect.mapError((cause) =>
      installRefused({
        category: "internal",
        detail: `The accepted path for Pack ${packIdentity} could not be read`,
        cause,
      }),
    ),
  );
  const previousMemberIdentities = yield* Option.match(acceptedPackPath, {
    onNone: () => Effect.succeed(new Set<string>()),
    onSome: (packPath) =>
      fs.readFileString(path.join(packPath, "pack.json")).pipe(
        Effect.mapError((cause) =>
          installRefused({
            category: "conflict",
            detail: `The accepted manifest for Pack ${packIdentity} could not be read`,
            cause,
          }),
        ),
        Effect.flatMap((raw) =>
          Effect.try({
            try: () => {
              const parsed: unknown = JSON.parse(raw);
              if (
                typeof parsed !== "object" ||
                parsed === null ||
                !("dependencies" in parsed) ||
                typeof parsed.dependencies !== "object" ||
                parsed.dependencies === null
              ) {
                throw new TypeError("Pack manifest dependencies are unavailable");
              }
              return new Set(
                Object.keys(parsed.dependencies).flatMap((fqn) => {
                  const member = parseExtensionFqnParts(fqn);
                  return member === undefined || member.type === "pack"
                    ? []
                    : [`${member.type}:${member.name}`];
                }),
              );
            },
            catch: (cause) =>
              installRefused({
                category: "conflict",
                detail: `The accepted manifest for Pack ${packIdentity} could not be inspected`,
                cause,
              }),
          }),
        ),
      ),
  });
  const previousMembers = yield* Effect.forEach(
    graph.nodes.filter(
      (node) => node.type !== "pack" && previousMemberIdentities.has(`${node.type}:${node.name}`),
    ),
    (node) =>
      acceptedLockedResolutionRef({ type: node.type, name: node.name }).pipe(
        Effect.mapError((cause) =>
          installRefused({
            category: "internal",
            detail: `The accepted source for pack member ${node.identity} could not be reconstructed`,
            cause,
          }),
        ),
        Effect.map(
          Option.match({
            onNone: () => [],
            onSome: (ref) => [
              {
                ref,
                retained: node.origins.some(
                  (origin) =>
                    origin.type === "settings" ||
                    (origin.type === "pack" &&
                      origin.pack.replace(/^workspace:/u, "") !==
                        packIdentity.replace(/^workspace:/u, "")),
                ),
              },
            ],
          }),
        ),
      ),
    { concurrency: 1 },
  ).pipe(Effect.map((members) => members.flat()));

  const nextDependencies = collectResolvedDependencyNames(refs);
  const unresolvedDroppedTargets: ReadonlyArray<DroppedPackDependency> = previousMembers.flatMap(
    ({ ref, retained }) => {
      if (ref.type === "pack" || retained || nextDependencies[ref.type].has(ref.name)) return [];
      return [{ target: targetFromRef(ref) }];
    },
  );
  const droppedTargets = yield* Effect.forEach(
    unresolvedDroppedTargets,
    (dropped) =>
      acceptedLockedCanonicalPath({
        type: dropped.target.type,
        name: dropped.target.name,
      }).pipe(
        Effect.map((canonicalPath) => ({
          ...dropped,
          sourcePath: Option.match(canonicalPath, {
            onNone: () => toLabel(dropped.target),
            onSome: (value) => path.relative(location.baseDir, value),
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
          return buildUninstallOperation(skillManager, exclusiveMemberRetentionPolicy, {
            toStepFailure: lifecycleStepFailure,
            target,
          });
        case "mcp-server":
          return buildUninstallOperation(mcpServerManager, exclusiveMemberRetentionPolicy, {
            toStepFailure: lifecycleStepFailure,
            target,
          });
        case "subagent":
          return buildUninstallOperation(subagentManager, exclusiveMemberRetentionPolicy, {
            toStepFailure: lifecycleStepFailure,
            target,
          });
        case "rule":
          return buildUninstallOperation(ruleManager, exclusiveMemberRetentionPolicy, {
            toStepFailure: lifecycleStepFailure,
            target,
            enclosingClosure: { projections: [target.type] },
          });
        case "hook":
          return buildUninstallOperation(hookManager, exclusiveMemberRetentionPolicy, {
            toStepFailure: lifecycleStepFailure,
            target,
            enclosingClosure: { projections: [target.type] },
          });
        case "knowledge":
          return buildUninstallOperation(knowledgeManager, exclusiveMemberRetentionPolicy, {
            toStepFailure: lifecycleStepFailure,
            target,
            enclosingClosure: { projections: [target.type] },
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
        path: registrySourcePath(ref, location.scope),
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
  // The pack's own row reads this closure's artifact, so it carries the same
  // version facts a member's artifact does: a pack that commits showed `-`
  // where every leaf showed what it moved to.
  const packRef = refs.find((ref) => ref.type === "pack");
  const packVersion =
    packRef?.refType === "registry" || packRef?.refType === "workspace"
      ? packRef.version
      : undefined;
  const acceptedPackRef = yield* acceptedLockedResolutionRef({
    type: "pack",
    name: intent.packToInstall.pack.name,
  }).pipe(
    Effect.mapError((cause) =>
      installRefused({
        category: "internal",
        detail: `The accepted source for Pack ${packIdentity} could not be reconstructed`,
        cause,
      }),
    ),
  );
  const previousPackVersion = Option.match(acceptedPackRef, {
    onNone: () => undefined,
    onSome: (ref) =>
      ref.refType === "registry" || ref.refType === "workspace" ? ref.version : undefined,
  });
  const graphStep = yield* buildReconciliationClosure({
    toStepFailure: lifecycleStepFailure,
    label: packIdentity,
    message: `Installed ${packIdentity} and ${refs.length - 1} pack member${refs.length === 2 ? "" : "s"}`,
    artifact: {
      path: "pack graph",
      scope: location.scope,
      change: "updated",
      fileCount: refs.length + droppedTargets.length,
      targets: artifactTargets,
      ...(packVersion === undefined ? {} : { version: packVersion }),
      ...(previousPackVersion === undefined || previousPackVersion === packVersion
        ? {}
        : { previousVersion: previousPackVersion }),
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
    jobs: [
      {
        concurrency: 1,
        steps: [
          {
            ...graphStep,
            sourceBinding: {
              extensionType: "pack",
              target: intent.packToInstall.pack.name,
              ref: intent.packToInstall,
              members: refs.filter((ref) => ref.type !== "pack"),
              previousMembers,
            },
          },
        ],
      },
    ],
    ...(releaseAge === undefined ? {} : { releaseAge }),
  } satisfies Plan<InstallStepRequirements>;
});
