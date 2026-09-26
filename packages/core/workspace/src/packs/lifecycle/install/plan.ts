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
import * as Effect from "effect/Effect";
import type * as Config from "effect/Config";
import * as FileSystem from "effect/FileSystem";
import { SettingsReader, WorkspaceLocation } from "../../../desired-state/index.js";

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
  buildPackMemberStep,
  buildUninstallOperation,
  targetFromRef,
  toLabel,
} from "../../../reconciliation/index.js";
import {
  extensionRefName,
  type ExtensionRef,
} from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import { sourceRefContentKey } from "../../../acquisition/acquired-content.js";
import type { PackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import {
  parseExtensionFqnParts,
  type ExtensionName,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import type { RegistrySource, Source } from "@agentxm/extension-model/unstable/sources/types";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
import { type VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import {
  normalizeReleaseAgeRecords,
  PackDependencyMissing,
  PackDependencyUnsatisfied,
} from "../../../resolution/index.js";
import {
  operationPresentation,
  type JobStepArtifactTarget,
  type Plan,
  type PlannedJobStep,
  type ExtensionLifecycleFailed,
  installRefused,
} from "../../../operations/index.js";
import {
  SourceHostProviders,
  resolveSource,
  sourceResolutionFailureCategory,
  type SourceResolutionFailure,
} from "../../../resolution/sources/index.js";
import {
  acceptedLockedCanonicalPath,
  acceptedLockedResolutionRef,
  isRequiredByAnotherOrigin,
  usableAcceptedCanonical,
  type HookExtensionTarget,
  type KnowledgeExtensionTarget,
  type McpServerExtensionTarget,
  type RuleExtensionTarget,
  type SkillExtensionTarget,
  type SubagentExtensionTarget,
} from "../../../desired-state/index.js";

import { StepFailureConversion } from "../../../reconciliation/index.js";
import { configuredPackConstraintBlockPlan } from "../constraint-gate.js";
import {
  ACCEPTED_RESOLUTION_INCOMPATIBLE_BLOCKER_ID,
  acceptedResolutionIncompatibleRecovery,
  acceptedResolutionIncompatibleText,
} from "../../../projection/index.js";
import { validatePackGraphPostcondition } from "../graph-transition.js";
import {
  exclusiveMemberRetentionPolicy,
  registrySourceArtifact,
  registrySourcePath,
} from "../../../reconciliation/index.js";
import {
  buildAggregateProjectionStep,
  sourceResolutionFailureDetail,
  sourceResolutionRefused,
  type InstallStepRequirements,
  type ResolveInstallRequirements,
} from "../../../reconciliation/index.js";
import {
  formatRegistryProbe,
  parseRegistryInstallTarget,
  registryLoginSuggestions,
  type RegistryLookupProbe,
} from "../../../resolution/sources/index.js";
import {
  scanWorkspaceAuthority,
  selectPackGraph,
  type PackGraphSelectionRequest,
} from "../../install/graph-selection.js";

/** One pack graph transition and the policy that governs it. */
export interface PackInstallIntent extends PackGraphSelectionRequest {
  readonly nonInteractive: boolean;
  /** Render shared aggregate projections after a larger enclosing transition. */
  readonly deferProjections?: boolean;
  /**
   * Reacquire the Pack's canonical content instead of reusing the installed
   * tree. Recovery sets this because the observed tree already diverged from
   * the accepted resolution, so reusing it would preserve the divergence.
   */
  readonly forceCanonical?: boolean;
}

/** A pack install request after grammar parsing, before anything is discovered. */
export interface ParsedPackInstallRequest {
  readonly owner: Option.Option<Handle>;
  readonly packName: Option.Option<ExtensionName>;
  readonly versionRange: Option.Option<VersionRange>;
  readonly resolvedInput: string;
  readonly inputKind:
    "name-input" | "name-input-with-version" | "registry-pattern-input" | "source-locator-input";
  readonly sourceResolution?: string;
  readonly nonInteractive: boolean;
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
) => Effect.Effect<
  ReadonlyArray<PackRef>,
  ExtensionLifecycleFailed | Config.ConfigError,
  ResolveInstallRequirements
> = Effect.fn("InstallExtensions.discoverPackRefs")(function* (request: PackSourceRequest) {
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
        cause._tag === "ConfigError" ? cause : sourceResolutionRefused(cause),
      ),
    );
  return refs.filter((ref): ref is PackRef => ref.type === "pack");
});

const isRemoteReadNotImplemented = (error: SourceResolutionFailure): boolean => {
  const detail = sourceResolutionFailureDetail(error);
  return detail.includes("not implemented") || detail.includes("not yet supported");
};

const summarizeLookupFailure = (error: SourceResolutionFailure): string =>
  `${sourceResolutionFailureDetail(error)} (${sourceResolutionFailureCategory(error)})`;

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
    if (ref.type !== "pack") names[ref.type].add(extensionRefName(ref));
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
  if (cause instanceof PackDependencyMissing) {
    return `Pack dependency ${cause.dependencyTarget} was not found`;
  }
  if (cause instanceof PackDependencyUnsatisfied) {
    return `Pack dependency ${cause.dependencyTarget} has no visible version satisfying ${cause.constraint}`;
  }
  if (typeof cause !== "object" || cause === null || !("detail" in cause)) return undefined;
  const detail = Reflect.get(cause, "detail");
  return typeof detail === "string" && detail.length > 0 ? detail : undefined;
};

/** The reference a Pack refused for a held member release carries. */
const HELD_PACK_RELEASE_BLOCKER_ID = "minimum-release-age";

/** What a pack install command supplies before anything is parsed. */
export interface PackInstallArgs {
  readonly source: string;
  readonly nonInteractive: boolean;
}

/** Read the pack source grammar: which owner, which pack, which range. */
export const parsePackInstallRequest: (
  args: PackInstallArgs,
) => Effect.Effect<ParsedPackInstallRequest, ExtensionLifecycleFailed, ResolveInstallRequirements> =
  Effect.fn("InstallExtensions.parsePackRequest")(function* (args: PackInstallArgs) {
    const settings = yield* SettingsReader;
    const trimmed = args.source.trim();
    const policy = { nonInteractive: args.nonInteractive } as const;
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
) => Effect.Effect<
  PackDiscovery,
  ExtensionLifecycleFailed | Config.ConfigError,
  ResolveInstallRequirements
> = Effect.fn("InstallExtensions.discoverPack")(function* (request: PackSourceRequest) {
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
          cause._tag === "ConfigError" ? cause : sourceResolutionRefused(cause),
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
  if (initialResult._tag === "Failure" && initialResult.failure._tag === "ConfigError") {
    return yield* Effect.fail(initialResult.failure);
  }
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
    return yield* sourceResolutionRefused(initialResult.failure, [
      { description: "Verify the pack name and registry configuration." },
    ]);
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

/** Settle the pack this request installs, under the policy the operation declared. */
export const finalizePackInstallIntent = (
  request: ParsedPackInstallRequest,
  discovery: PackDiscovery,
  policy: Pick<PackInstallIntent, "releaseAgeEvaluation" | "heldRelease">,
): PackInstallIntent => ({
  packToInstall: discovery.ref,
  versionRange: request.versionRange,
  nonInteractive: request.nonInteractive,
  releaseAgeEvaluation: policy.releaseAgeEvaluation,
  heldRelease: policy.heldRelease,
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
  | StepFailureConversion
  | SubagentManager;

/** The single atomic closure a settled pack intent becomes. */
export const planPackInstall: (
  intent: PackInstallIntent,
) => Effect.Effect<
  Plan<InstallStepRequirements>,
  ExtensionLifecycleFailed,
  PackInstallRequirements
> = Effect.fn("InstallExtensions.planPack")(function* (intent: PackInstallIntent) {
  const conversion = yield* StepFailureConversion;
  const location = yield* WorkspaceLocation;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const packManager = yield* PackManager;
  const skillManager = yield* SkillManager;
  const subagentManager = yield* SubagentManager;
  const ruleManager = yield* RuleManager;
  const hookManager = yield* HookManager;
  const knowledgeManager = yield* KnowledgeManager;
  const mcpServerManager = yield* McpServerManager;

  const packIdentity = `${intent.packToInstall.owner}/packs/${intent.packToInstall.name}`;
  const selection = yield* selectPackGraph(intent).pipe(
    Effect.mapError((cause) => {
      if (cause._tag === "ExtensionLifecycleFailed") return cause;
      const memberFailure = failureDetail(cause);
      return installRefused({
        category: "conflict",
        detail: `Pack ${packIdentity} could not be expanded${memberFailure === undefined ? "" : `: ${memberFailure}`}`,
        cause,
      });
    }),
  );
  if (selection.kind === "authority-blocked") {
    const suggestions = selection.blockers
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
              errorMessage: selection.blockers.map((fact) => fact.detail).join("; "),
              blockingConditionIds: selection.blockers.map((fact) => fact.id),
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
      riskConditions: selection.blockers.map((fact) => ({
        level: "blocked" as const,
        id: fact.id,
        detail: fact.detail,
        errorCode: "conflict" as const,
      })),
      failureSuggestions: suggestions,
    } satisfies Plan<InstallStepRequirements>;
  }
  if (selection.kind === "constraint-blocked") {
    return configuredPackConstraintBlockPlan({
      operation: "install",
      problems: selection.conflicts,
      blockedPackLabels: [packIdentity],
    });
  }
  if (selection.kind === "accepted-incompatible") {
    const detail = acceptedResolutionIncompatibleText(selection.mismatch.fact);
    return {
      _tag: "Plan",
      name: "Install pack",
      description: Option.some(
        "A member's accepted resolution no longer satisfies its effective constraint",
      ),
      presentation: operationPresentation(
        { imperative: "install", past: "Installed", gerund: "Installing" },
        "pack",
      ),
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              readiness: "error",
              label: packIdentity,
              errorMessage: detail,
              blockingConditionIds: [ACCEPTED_RESOLUTION_INCOMPATIBLE_BLOCKER_ID],
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
      riskConditions: [
        {
          level: "blocked" as const,
          id: ACCEPTED_RESOLUTION_INCOMPATIBLE_BLOCKER_ID,
          detail,
          errorCode: "conflict" as const,
        },
      ],
      failureSuggestions: [acceptedResolutionIncompatibleRecovery(selection.mismatch.fqn)],
    } satisfies Plan<InstallStepRequirements>;
  }
  const releaseAge = {
    evaluatedAt: DateTime.formatIso(intent.releaseAgeEvaluation.evaluatedAt),
    holdbacks: normalizeReleaseAgeRecords(selection.holdbacks),
    bypasses: normalizeReleaseAgeRecords(selection.bypasses),
  };

  if (selection.kind === "held") {
    const presentation = operationPresentation(
      { imperative: "install", past: "Installed", gerund: "Installing" },
      "pack",
    );
    if (selection.preserved) {
      return {
        _tag: "Plan",
        name: "Install pack",
        description: Option.some(
          "The current pack graph is unchanged while a required release ages",
        ),
        presentation,
        jobs: [],
        releaseAge,
      } satisfies Plan<InstallStepRequirements>;
    }
    // The refusal is a step as well as a risk, so a sweep that composes this
    // Pack's steps into one plan still refuses it.
    return {
      _tag: "Plan",
      name: "Install pack",
      description: Option.some(
        "The selected pack graph includes a release held by the minimum release age",
      ),
      presentation,
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              readiness: "error",
              label: packIdentity,
              errorMessage: `Pack ${packIdentity} requires a release the minimum release age still holds back, and no complete usable accepted resolution can be preserved`,
              blockingConditionIds: [HELD_PACK_RELEASE_BLOCKER_ID],
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
      releaseAge,
      riskConditions: [
        {
          level: "blocked" as const,
          id: HELD_PACK_RELEASE_BLOCKER_ID,
          detail: "The selected pack graph has no complete usable accepted resolution.",
          errorCode: "conflict" as const,
        },
      ],
    } satisfies Plan<InstallStepRequirements>;
  }

  const { authority, proposedGraph, refs } = selection;
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
      | McpServerManager
      | RuleManager
      | SkillManager
      | SubagentManager
      | WorkspaceLocation
    > =>
      ref.type === "pack"
        ? Effect.succeed(
            buildInstallOperation(packManager, {
              toStepFailure: conversion.toStepFailure,
              ref,
              declaration: { name: ref.pack.name, versionRange: intent.versionRange },
              ...(intent.forceCanonical === true ? { force: true } : {}),
              buildArtifact: ({ change }) =>
                Effect.succeed(registrySourceArtifact({ ref, scope: location.scope, change })),
            }),
          )
        : buildPackMemberStep({
            ref,
            nonInteractive: intent.nonInteractive,
            strictAgentSync: true,
            toStepFailure: conversion.toStepFailure,
          }),
    { concurrency: 1 },
  );

  const acquisitionRefs = yield* Effect.forEach(refs, (ref) =>
    Effect.gen(function* () {
      if (ref.type === "pack" || ref.refType === "workspace") return ref;
      const canonical = yield* usableAcceptedCanonical({
        type: ref.type,
        name: targetFromRef(ref).name,
      }).pipe(
        Effect.mapError((cause) =>
          installRefused({
            category: "internal",
            detail: `Accepted canonical content for ${targetFromRef(ref).name} could not be inspected`,
            cause,
          }),
        ),
      );
      return Option.isSome(canonical) &&
        sourceRefContentKey(canonical.value.ref) === sourceRefContentKey(ref)
        ? undefined
        : ref;
    }),
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
                retained: isRequiredByAnotherOrigin(node, [packIdentity]),
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
            toStepFailure: conversion.toStepFailure,
            target,
          });
        case "mcp-server":
          return buildUninstallOperation(mcpServerManager, exclusiveMemberRetentionPolicy, {
            toStepFailure: conversion.toStepFailure,
            target,
          });
        case "subagent":
          return buildUninstallOperation(subagentManager, exclusiveMemberRetentionPolicy, {
            toStepFailure: conversion.toStepFailure,
            target,
          });
        case "rule":
          return buildUninstallOperation(ruleManager, exclusiveMemberRetentionPolicy, {
            toStepFailure: conversion.toStepFailure,
            target,
            enclosingClosure: { projections: [target.type] },
          });
        case "hook":
          return buildUninstallOperation(hookManager, exclusiveMemberRetentionPolicy, {
            toStepFailure: conversion.toStepFailure,
            target,
            enclosingClosure: { projections: [target.type] },
          });
        case "knowledge":
          return buildUninstallOperation(knowledgeManager, exclusiveMemberRetentionPolicy, {
            toStepFailure: conversion.toStepFailure,
            target,
            enclosingClosure: { projections: [target.type] },
          });
      }
    },
  );

  const resolvedTargets = refs.map(targetFromRef);
  // The desired-state graph alone decides a member's activation, so the
  // postcondition expects what the proposed graph already settled: an
  // activation preference survives a Pack replacement because the graph binds
  // it, not because this planner recomputes it. A member the proposed graph
  // does not hold yet — a fresh install — gets no activation expectation.
  const expectedMemberActivation = (target: PackDependencyTarget): boolean | undefined =>
    proposedGraph.nodes.find((node) => node.type === target.type && node.name === target.name)
      ?.enabled;
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
    toStepFailure: conversion.toStepFailure,
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
      requiredMembers: resolvedTargets.flatMap((target) => {
        if (target.type === "pack") return [];
        const enabled = expectedMemberActivation(target);
        return enabled === undefined
          ? [{ type: target.type, name: target.name, packIdentity }]
          : [{ type: target.type, name: target.name, packIdentity, enabled }];
      }),
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
            acquisitionRefs: acquisitionRefs.filter((ref) => ref !== undefined),
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
    releaseAge,
  } satisfies Plan<InstallStepRequirements>;
});
