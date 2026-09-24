import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as semver from "semver";
import {
  extensionTypes,
  packMemberRegistrySource,
  packMemberVersionRange,
  parseExtensionFqnParts,
  parseRegistrySourceRef,
  toExtensionTypePlural,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import { PackManifestSchema } from "@agentxm/extension-model/unstable/packs/manifest-schema";
import type { PackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import type { Settings } from "../settings/index.js";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import { effectiveExtensionActivation, isDesiredExtensionActive } from "./desired-state-enabled.js";
import type { WorkspaceLayout } from "./layout.js";
import type { PackLockEntry } from "../lockfile/schema.js";
import type { PackManifestsPort } from "./pack-manifests.js";
import { SETTINGS_FILENAME } from "@agentxm/extension-model/unstable/workspace-files";
import {
  intersectVersionConstraints,
  VersionRangeSchema,
  type VersionRange,
} from "@agentxm/extension-model/unstable/version-constraints";
import { mcpRegistryResolutionKey } from "./mcp-source-identity.js";

export type DesiredExtensionOrigin =
  | {
      readonly type: "settings";
      readonly localName?: string;
      readonly authority?: "sourced";
      readonly source: string;
      readonly enabled: boolean;
      readonly constraint?: string;
    }
  | {
      readonly type: "settings";
      readonly localName?: string;
      readonly authority: "inline";
      readonly source?: undefined;
      readonly constraint?: undefined;
      readonly enabled: boolean;
    }
  | {
      readonly type: "pack";
      readonly pack: string;
      readonly manifestPath: string;
      readonly source: string;
      readonly sourceAuthority?: string;
      readonly constraint: string;
      readonly enabled: boolean;
    };

/**
 * A preference a settings entry expresses about a Pack-supplied member.
 *
 * It is deliberately not a `DesiredExtensionOrigin`: a preference declares no
 * acquisition, so it must never satisfy a check that asks whether settings
 * declared this extension. It contributes no constraint and no source.
 */
export interface DesiredMemberPreference {
  readonly localName: string;
  readonly location: string;
  readonly enabled?: boolean;
  readonly instructionEntry?: boolean;
  readonly env?: Readonly<Record<string, string>>;
}

interface DesiredExtensionNodeCommon {
  readonly type: ExtensionType;
  readonly name: string;
  readonly identity: string;
  readonly enabled: boolean;
  readonly constraints: ReadonlyArray<string>;
  readonly origins: ReadonlyArray<DesiredExtensionOrigin>;
  /** Present when a source-less settings entry configures this member. */
  readonly preference?: DesiredMemberPreference;
}

export type DesiredExtensionNode = DesiredExtensionNodeCommon &
  (
    | { readonly authority?: "sourced"; readonly source: string }
    | {
        readonly type: "mcp-server";
        readonly authority: "inline";
        readonly source?: undefined;
      }
  );

export const isInlineDesiredExtension = (
  node: DesiredExtensionNode,
): node is DesiredExtensionNode & { readonly authority: "inline" } => node.authority === "inline";

export const isSourcedDesiredExtension = (
  node: DesiredExtensionNode,
): node is DesiredExtensionNode & { readonly source: string } => node.authority !== "inline";

export interface DesiredConstraintContributor {
  readonly source: "settings" | "pack";
  readonly range: string;
  readonly location: string;
  readonly dependingPack?: string;
  readonly localName?: string;
}

export type DesiredStateProblem =
  | {
      readonly type: "workspace-owner-missing";
      readonly extensionType: ExtensionType;
      readonly name: string;
    }
  | {
      readonly type: "pack-manifest-unavailable";
      readonly pack: string;
      readonly path: string;
    }
  | {
      readonly type: "pack-manifest-invalid";
      readonly pack: string;
      readonly path: string;
    }
  | {
      readonly type: "pack-identity-mismatch";
      readonly pack: string;
      readonly path: string;
      readonly detail: string;
    }
  | {
      readonly type: "pack-resolution-unavailable";
      readonly pack: string;
      readonly detail: string;
    }
  | {
      readonly type: "pack-manifest-content-mismatch";
      readonly pack: string;
      readonly path?: string;
      readonly status: string;
      readonly acceptedVersion: string;
      readonly acceptedContentIdentity: string;
      readonly observedVersion?: string;
      readonly observedContentIdentity?: string;
    }
  | {
      readonly type: "projection-collision";
      readonly extensionType: ExtensionType;
      readonly name: string;
      readonly identities: ReadonlyArray<string>;
    }
  | {
      readonly type: "constraint-conflict";
      readonly extensionType: ExtensionType;
      readonly name: string;
      readonly constraints: ReadonlyArray<string>;
      readonly contributors: ReadonlyArray<DesiredConstraintContributor>;
    }
  | {
      /**
       * A source-less settings entry configures a member no configured Pack
       * supplies under that local name. The entry cannot be repaired by
       * guessing a source, so it is reported rather than silently ignored.
       */
      readonly type: "member-configuration-unbound";
      readonly extensionType: ExtensionType;
      readonly name: string;
      readonly location: string;
    };

/** Contributors whose ranges share no version: a blocker every planner reports unchanged. */
export type DesiredConstraintConflict = Extract<
  DesiredStateProblem,
  { readonly type: "constraint-conflict" }
>;

/** The one range a desired node is selected within, and every contributor that decided it. */
export interface DesiredEffectiveConstraint {
  /** The intersection of every contributor's range; none when nothing constrains the node. */
  readonly range: Option.Option<VersionRange>;
  readonly contributors: ReadonlyArray<DesiredConstraintContributor>;
}

export interface DesiredStateGraph {
  readonly complete: boolean;
  readonly nodes: ReadonlyArray<DesiredExtensionNode>;
  readonly mcpSourceClosures: ReadonlyArray<DesiredMcpSourceClosure>;
  readonly problems: ReadonlyArray<DesiredStateProblem>;
}

export interface DesiredMcpSourceClosure {
  readonly identity: string;
  readonly localNames: ReadonlyArray<string>;
  readonly constraints: ReadonlyArray<string>;
  readonly origins: ReadonlyArray<DesiredExtensionOrigin>;
}

export type ProspectivePackRef = Pick<PackRef, "owner" | "pack" | "version">;

interface DesiredStateGraphArgs {
  readonly manifests: PackManifestsPort;
  readonly baseDir: string;
  readonly settings: Settings;
  readonly layout?: WorkspaceLayout;
  /** Resolved Pack roots whose manifests supersede the currently materialized copy. */
  readonly prospectivePacks?: ReadonlyArray<ProspectivePackRef>;
  /** Registry source aliases mapped to their stable authority endpoints. */
  readonly registryAccessorities?: Readonly<Record<string, URL | string>>;
  /** Accepted external pack identities keyed by settings name. */
  readonly acceptedPacks?: Readonly<Record<string, PackLockEntry>>;
}

interface CandidateCommon {
  readonly type: ExtensionType;
  readonly name: string;
  readonly identity: string;
  readonly enabled: boolean;
  readonly constraint?: string;
  readonly origin: DesiredExtensionOrigin;
}

type Candidate = CandidateCommon &
  (
    | { readonly authority: "sourced"; readonly source: string }
    | {
        readonly type: "mcp-server";
        readonly authority: "inline";
        readonly source?: undefined;
      }
  );

interface PackIdentity {
  readonly owner: Handle;
  readonly name: string;
  readonly fqn: string;
  readonly constraint?: string;
}

const packAuthorityIdentity = (
  configuredSource: string,
  accepted: PackLockEntry | undefined,
  workspaceIdentity: string,
  baseDir: string,
): string => {
  if (isWorkspaceSourceLocator(configuredSource)) return `workspace:${workspaceIdentity}`;
  if (accepted === undefined) return configuredSource;
  switch (accepted.source.type) {
    case "registry":
      return `registry:${accepted.source.url.href}`;
    case "path": {
      const normalized = configuredSource.replaceAll("\\", "/").replace(/\/$/u, "");
      const packageSuffix = `/packs/${accepted.identity.name}`;
      const sourceRoot = normalized.endsWith(packageSuffix)
        ? normalized.slice(0, -packageSuffix.length)
        : normalized;
      const absoluteSourceRoot = sourceRoot.startsWith("/")
        ? sourceRoot
        : `${baseDir.replaceAll("\\", "/").replace(/\/$/u, "")}/${sourceRoot.replace(/^\.\//u, "")}`;
      return `path:${absoluteSourceRoot}`;
    }
    case "git":
      return `git:${accepted.source.url.href}#${accepted.source.revision ?? "HEAD"}`;
  }
};

const nodeKey = (type: ExtensionType, name: string): string => `${type}:${name}`;

const packageIdentity = (identity: string): string =>
  identity.startsWith("workspace:") ? identity.slice("workspace:".length) : identity;

const registryLocator = (
  source: string,
  defaultRegistry = "agentxm",
): { readonly sourceName: string; readonly ref: string } | undefined => {
  if (source.startsWith("@")) return { sourceName: defaultRegistry, ref: source };
  const separator = source.indexOf(":");
  if (separator <= 0) return undefined;
  const ref = source.slice(separator + 1);
  return ref.startsWith("@") ? { sourceName: source.slice(0, separator), ref } : undefined;
};

const withVersionConstraint = (source: string, constraint: string): string => {
  const locator = registryLocator(source);
  if (locator === undefined) return source;
  const parsed = parseRegistrySourceRef(locator.ref);
  if (parsed === undefined) return source;
  const prefix = source.startsWith("@") ? "" : `${locator.sourceName}:`;
  return `${prefix}${parsed.owner}/${parsed.type}/${parsed.name}@${constraint}`;
};

const sourceIdentity = (
  type: ExtensionType,
  name: string,
  source: string,
  settings: Settings,
  registryAccessorities: Readonly<Record<string, URL | string>>,
): { readonly identity: string; readonly constraint?: string } => {
  if (isWorkspaceSourceLocator(source)) {
    return settings.owner === undefined
      ? { identity: source }
      : { identity: `workspace:${settings.owner}/${toExtensionTypePlural(type)}/${name}` };
  }

  const locator = registryLocator(source, settings.defaultRegistry);
  const parsed = locator === undefined ? undefined : parseRegistrySourceRef(locator.ref);
  if (parsed !== undefined && parsed.type === toExtensionTypePlural(type)) {
    const registryAccessority =
      locator === undefined ? undefined : registryAccessorities[locator.sourceName];
    return {
      identity:
        type === "mcp-server" && registryAccessority !== undefined
          ? mcpRegistryResolutionKey({
              authority: registryAccessority,
              owner: parsed.owner,
              name: parsed.name,
            })
          : `${parsed.owner}/${parsed.type}/${parsed.name}`,
      ...(parsed.versionRange === undefined ? {} : { constraint: parsed.versionRange }),
    };
  }

  return { identity: source };
};

const packIdentity = (
  settingsName: string,
  source: string,
  settings: Settings,
  accepted: PackLockEntry | undefined,
  prospective: ProspectivePackRef | undefined,
): PackIdentity | undefined => {
  if (isWorkspaceSourceLocator(source)) {
    if (settings.owner === undefined) return undefined;
    return {
      owner: settings.owner,
      name: settingsName,
      fqn: `${settings.owner}/packs/${settingsName}`,
    };
  }

  const locator = registryLocator(source, settings.defaultRegistry);
  const parsed = locator === undefined ? undefined : parseRegistrySourceRef(locator.ref);
  if (parsed !== undefined && parsed.type === "packs") {
    return {
      owner: parsed.owner,
      name: parsed.name,
      fqn: `${parsed.owner}/packs/${parsed.name}`,
      ...(parsed.versionRange === undefined ? {} : { constraint: parsed.versionRange }),
    };
  }

  if (source === "registry" && settings.owner !== undefined) {
    return {
      owner: settings.owner,
      name: settingsName,
      fqn: `${settings.owner}/packs/${settingsName}`,
    };
  }

  const owner = accepted?.identity.owner ?? prospective?.owner;
  const name = accepted?.identity.name ?? prospective?.pack.name;
  if (owner !== undefined && name !== undefined) {
    return { owner, name, fqn: `${owner}/packs/${name}` };
  }

  return undefined;
};

const sortConstraintContributors = (
  contributors: ReadonlyArray<DesiredConstraintContributor>,
): ReadonlyArray<DesiredConstraintContributor> =>
  [...contributors].sort((left, right) => {
    const byPack = (left.dependingPack ?? "").localeCompare(right.dependingPack ?? "");
    if (byPack !== 0) return byPack;
    const byRange = left.range.localeCompare(right.range);
    return byRange === 0 ? left.location.localeCompare(right.location) : byRange;
  });

export const collectDesiredConstraintContributors = (
  origins: ReadonlyArray<DesiredExtensionOrigin>,
): ReadonlyArray<DesiredConstraintContributor> =>
  sortConstraintContributors(
    origins.flatMap((origin): ReadonlyArray<DesiredConstraintContributor> => {
      if (origin.type === "settings" && origin.authority === "inline") return [];
      if (origin.constraint === undefined) return [];
      if (origin.type === "settings") {
        return [
          {
            source: "settings",
            range: origin.constraint,
            location: SETTINGS_FILENAME,
            ...(origin.localName === undefined ? {} : { localName: origin.localName }),
          },
        ];
      }
      return [
        {
          source: "pack",
          dependingPack: packageIdentity(origin.pack),
          range: origin.constraint,
          location: origin.manifestPath,
        },
      ];
    }),
  );

/**
 * One owner's contribution after a change a planner is about to make: the
 * direct declaration for a local name, or a Pack. A direct declaration the
 * change rewrites without a range contributes nothing afterwards.
 */
export type DesiredConstraintProposal =
  | DesiredConstraintContributor
  | { readonly source: "settings"; readonly localName: string; readonly range?: undefined };

const contributorOwner = (contributor: DesiredConstraintProposal): string =>
  contributor.source === "pack"
    ? `pack:${packageIdentity(contributor.dependingPack ?? "")}`
    : `settings:${contributor.localName ?? ""}`;

const isContributor = (
  proposal: DesiredConstraintProposal,
): proposal is DesiredConstraintContributor => proposal.range !== undefined;

const decodeRange = Schema.decodeUnknownOption(VersionRangeSchema);

/** Intersect every contributor for one subject; the only combination rule the graph applies. */
const combineConstraintContributors = (
  subject: { readonly extensionType: ExtensionType; readonly name: string },
  contributors: ReadonlyArray<DesiredConstraintContributor>,
): Result.Result<DesiredEffectiveConstraint, DesiredConstraintConflict> => {
  const constraints = [...new Set(contributors.map((contributor) => contributor.range))];
  const intersection = intersectVersionConstraints(constraints);
  // One distinct range is its own intersection, and reads as it was declared.
  const range =
    intersection === undefined
      ? Option.none()
      : Option.orElse(constraints.length === 1 ? decodeRange(constraints[0]) : Option.none(), () =>
          decodeRange(intersection),
        );
  if (Option.isNone(range)) {
    return Result.fail({
      type: "constraint-conflict",
      extensionType: subject.extensionType,
      name: subject.name,
      constraints,
      contributors,
    });
  }
  return Result.succeed({
    range: contributors.length === 0 ? Option.none() : range,
    contributors,
  });
};

/**
 * The effective constraint for one desired node: the intersection of every
 * contributor — its direct declaration and every Pack that requires it — or
 * the conflict that names them all. This is the only place direct and Pack
 * contributors combine; planners select within the range it returns and
 * block on the conflict it reports.
 *
 * A sourced MCP server's contributors are its whole source-resolution
 * closure, because every local connection to one source shares a resolution.
 *
 * `proposed` contributions describe a change a planner is about to make: each
 * one replaces the graph's contributors with the same owner — the direct
 * declaration for that local name, or that Pack — so a planner asks what the
 * constraint becomes after its own change without publishing it. A target
 * the graph does not desire is constrained by its proposed contributors
 * only, except that a prospective MCP connection naming a source `identity`
 * joins that source's closure and is constrained by it as well.
 */
export const effectiveDesiredConstraint = (
  graph: Pick<DesiredStateGraph, "nodes" | "mcpSourceClosures">,
  target: { readonly type: ExtensionType; readonly name: string; readonly identity?: string },
  proposed: ReadonlyArray<DesiredConstraintProposal> = [],
): Result.Result<DesiredEffectiveConstraint, DesiredConstraintConflict> => {
  const node = graph.nodes.find(
    (candidate) => candidate.type === target.type && candidate.name === target.name,
  );
  const closureIdentity =
    target.type !== "mcp-server"
      ? undefined
      : node === undefined
        ? target.identity
        : isSourcedDesiredExtension(node)
          ? node.identity
          : undefined;
  const closure =
    closureIdentity === undefined
      ? undefined
      : graph.mcpSourceClosures.find((candidate) => candidate.identity === closureIdentity);
  const replaced = new Set(proposed.map(contributorOwner));
  const current = collectDesiredConstraintContributors(
    closure?.origins ?? node?.origins ?? [],
  ).filter((contributor) => !replaced.has(contributorOwner(contributor)));
  return combineConstraintContributors(
    {
      extensionType: target.type,
      name:
        closure === undefined
          ? target.name
          : [...new Set([...closure.localNames, target.name])].sort().join(", "),
    },
    sortConstraintContributors([...current, ...proposed.filter(isContributor)]),
  );
};

/**
 * A node's origins apart from the excluded Packs. Pack identities compare
 * without the `workspace:` prefix, so an authored Pack and the identity a
 * caller names for it are one Pack.
 */
export const originsOutsidePacks = (
  node: Pick<DesiredExtensionNode, "origins">,
  excluding: Iterable<string>,
): ReadonlyArray<DesiredExtensionOrigin> => {
  const excluded = new Set([...excluding].map(packageIdentity));
  return node.origins.filter(
    (origin) => origin.type !== "pack" || !excluded.has(packageIdentity(origin.pack)),
  );
};

/**
 * Whether something other than the excluded Packs still requires this node:
 * its direct declaration or another Pack. Removing, replacing, or disabling
 * the excluded Packs leaves such a node desired, so it is retained rather
 * than retired.
 */
export const isRequiredByAnotherOrigin = (
  node: Pick<DesiredExtensionNode, "origins">,
  excluding: Iterable<string>,
): boolean => originsOutsidePacks(node, excluding).length > 0;

const parsePackManifest = (raw: string) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const decoded = Schema.decodeUnknownResult(PackManifestSchema)(parsed);
  return Result.isSuccess(decoded) ? decoded.success : undefined;
};

export const buildDesiredStateGraph = ({
  manifests,
  baseDir,
  settings,
  layout,
  prospectivePacks = [],
  registryAccessorities = {},
  acceptedPacks = {},
}: DesiredStateGraphArgs): Effect.Effect<DesiredStateGraph, never> =>
  Effect.gen(function* () {
    const candidates: Candidate[] = [];
    const problems: DesiredStateProblem[] = [];
    /** Source-less settings entries, awaiting a Pack-supplied provider. */
    const preferences = new Map<string, DesiredMemberPreference>();
    /**
     * Members some configured Pack declares, whether or not that Pack is
     * enabled. A disabled Pack still proves membership, so a preference on one
     * of its members stays dormant instead of reading as an orphan.
     */
    const provenMembership = new Set<string>();
    /**
     * Set when a configured Pack's membership could not be read. Orphanhood is
     * then unprovable, so no unbound-configuration problem is reported.
     */
    let membershipIncomplete = false;
    const prospectivePacksByIdentity = new Map(
      prospectivePacks.map((ref) => [`${ref.owner}/packs/${ref.pack.name}`, ref]),
    );

    const addMemberPreference = (
      type: Exclude<ExtensionType, "pack">,
      name: string,
      entry: {
        readonly enabled?: boolean | undefined;
        readonly instructionEntry?: boolean | undefined;
        readonly env?: Readonly<Record<string, string>> | undefined;
      },
    ) => {
      preferences.set(nodeKey(type, name), {
        localName: name,
        location: SETTINGS_FILENAME,
        ...(entry.enabled === undefined ? {} : { enabled: entry.enabled }),
        ...(entry.instructionEntry === undefined
          ? {}
          : { instructionEntry: entry.instructionEntry }),
        ...(entry.env === undefined || Object.keys(entry.env).length === 0
          ? {}
          : { env: entry.env }),
      });
    };

    const addSettingsEntries = (
      type: Exclude<ExtensionType, "pack">,
      entries:
        | Readonly<
            Record<
              string,
              {
                readonly kind?: "sourced" | "inline" | "configuration" | undefined;
                readonly source?: string | undefined;
                readonly enabled?: boolean | undefined;
                readonly instructionEntry?: boolean | undefined;
                readonly origin?: "bundled" | undefined;
              }
            >
          >
        | undefined,
    ) => {
      for (const [name, entry] of Object.entries(entries ?? {})) {
        if (entry.kind === "configuration" || entry.source === undefined) {
          addMemberPreference(type, name, entry);
          continue;
        }
        const bundled = type === "skill" && entry.origin === "bundled";
        const identity = bundled
          ? { identity: `bundled:@agentxm/skills/${name}` }
          : sourceIdentity(type, name, entry.source, settings, registryAccessorities);
        if (!bundled && isWorkspaceSourceLocator(entry.source) && settings.owner === undefined) {
          problems.push({ type: "workspace-owner-missing", extensionType: type, name });
        }
        candidates.push({
          type,
          name,
          identity: identity.identity,
          authority: "sourced",
          source: entry.source,
          enabled: entry.enabled !== false,
          ...(identity.constraint === undefined ? {} : { constraint: identity.constraint }),
          origin: {
            type: "settings",
            localName: name,
            authority: "sourced",
            source: entry.source,
            enabled: entry.enabled !== false,
            ...(identity.constraint === undefined ? {} : { constraint: identity.constraint }),
          },
        });
      }
    };

    addSettingsEntries("skill", settings.skills);
    for (const [name, entry] of Object.entries(settings.mcpServers ?? {})) {
      if (entry.kind === "configuration") {
        addMemberPreference("mcp-server", name, entry);
        continue;
      }
      if (entry.kind === "inline") {
        candidates.push({
          type: "mcp-server",
          name,
          identity: `@workspace/mcps/${name}`,
          authority: "inline",
          enabled: entry.enabled,
          origin: {
            type: "settings",
            localName: name,
            authority: "inline",
            enabled: entry.enabled,
          },
        });
        continue;
      }
      if (entry.source === undefined) {
        addMemberPreference("mcp-server", name, entry);
        continue;
      }
      const identity = sourceIdentity(
        "mcp-server",
        name,
        entry.source,
        settings,
        registryAccessorities,
      );
      if (isWorkspaceSourceLocator(entry.source) && settings.owner === undefined) {
        problems.push({ type: "workspace-owner-missing", extensionType: "mcp-server", name });
      }
      candidates.push({
        type: "mcp-server",
        name,
        identity: identity.identity,
        authority: "sourced",
        source: entry.source,
        enabled: entry.enabled,
        ...(identity.constraint === undefined ? {} : { constraint: identity.constraint }),
        origin: {
          type: "settings",
          localName: name,
          authority: "sourced",
          source: entry.source,
          enabled: entry.enabled,
          ...(identity.constraint === undefined ? {} : { constraint: identity.constraint }),
        },
      });
    }
    addSettingsEntries("subagent", settings.subagents);
    addSettingsEntries("rule", settings.rules);
    addSettingsEntries("hook", settings.hooks);
    addSettingsEntries("knowledge", settings.knowledge);

    for (const [settingsName, entry] of Object.entries(settings.packs ?? {})) {
      const acceptedPack = acceptedPacks[settingsName];
      const prospectivePack = prospectivePacks.find(
        (candidate) => candidate.pack.name === settingsName,
      );
      const identity = packIdentity(
        settingsName,
        entry.source,
        settings,
        acceptedPack,
        prospectivePack,
      );
      if (identity === undefined) {
        problems.push({
          type: "pack-identity-mismatch",
          pack: entry.source,
          path: "",
          detail: "The configured pack source does not identify a Registry or workspace pack.",
        });
        continue;
      }

      candidates.push({
        type: "pack",
        name: identity.name,
        identity: isWorkspaceSourceLocator(entry.source)
          ? `workspace:${identity.fqn}`
          : identity.fqn,
        authority: "sourced",
        source: entry.source,
        enabled: entry.enabled !== false,
        ...(identity.constraint === undefined ? {} : { constraint: identity.constraint }),
        origin: {
          type: "settings",
          localName: identity.name,
          authority: "sourced",
          source: entry.source,
          enabled: entry.enabled !== false,
          ...(identity.constraint === undefined ? {} : { constraint: identity.constraint }),
        },
      });

      const packEnabled = entry.enabled !== false;
      const workspacePack = isWorkspaceSourceLocator(entry.source);
      const inheritedMemberAuthority = packAuthorityIdentity(
        entry.source,
        acceptedPack,
        identity.fqn,
        baseDir,
      );
      const configuredRegistrySource =
        registryLocator(entry.source, settings.defaultRegistry)?.sourceName ??
        settings.defaultRegistry ??
        "agentxm";
      const document = manifests.locate({
        owner: identity.owner,
        name: identity.name,
        sourceFamily: workspacePack
          ? "workspace"
          : acceptedPack?.source.type === "path"
            ? "path"
            : acceptedPack === undefined || acceptedPack.source.type === "registry"
              ? "registry"
              : "git",
        relativeTo: baseDir,
        workspace: layout === undefined ? { baseDir, settings } : { layout },
      });
      const manifestPath = document.path;
      const prospective = prospectivePacksByIdentity.get(identity.fqn);
      const manifest = yield* prospective === undefined
        ? Effect.gen(function* () {
            const contents = yield* document.contents;
            if (contents === undefined) {
              if (packEnabled) {
                problems.push({
                  type: "pack-manifest-unavailable",
                  pack: identity.fqn,
                  path: manifestPath,
                });
              }
              return undefined;
            }

            const decoded = parsePackManifest(contents);
            if (decoded === undefined && packEnabled) {
              problems.push({
                type: "pack-manifest-invalid",
                pack: identity.fqn,
                path: manifestPath,
              });
            }
            return decoded;
          })
        : Effect.succeed({
            owner: prospective.owner,
            type: "pack" as const,
            name: prospective.pack.name,
            version: prospective.version,
            dependencies: prospective.pack.dependencies,
          });
      if (manifest === undefined) {
        membershipIncomplete = true;
        continue;
      }
      if (
        manifest.owner !== identity.owner ||
        manifest.name !== identity.name ||
        (identity.constraint !== undefined &&
          !semver.satisfies(manifest.version, identity.constraint))
      ) {
        if (packEnabled) {
          problems.push({
            type: "pack-identity-mismatch",
            pack: identity.fqn,
            path: manifestPath,
            detail: `Expected ${identity.fqn}${identity.constraint === undefined ? "" : `@${identity.constraint}`}, found ${manifest.owner}/packs/${manifest.name}@${manifest.version}.`,
          });
        }
        membershipIncomplete = true;
        continue;
      }

      for (const [fqn, declaration] of Object.entries(manifest.dependencies)) {
        const parsed = parseExtensionFqnParts(fqn);
        if (parsed === undefined || parsed.type === "pack") continue;
        // Membership is proven by the manifest, not by the Pack being active:
        // a disabled Pack still supplies the identity its members configure.
        provenMembership.add(nodeKey(parsed.type, parsed.name));
        if (!packEnabled) continue;
        const constraint = packMemberVersionRange(declaration);
        const declaredSource = packMemberRegistrySource(declaration);
        const dependencyIdentity =
          declaredSource !== undefined
            ? `registry:${declaredSource.url.href}:${fqn}`
            : parsed.type === "mcp-server" &&
                registryAccessorities[configuredRegistrySource] !== undefined
              ? mcpRegistryResolutionKey({
                  authority: registryAccessorities[configuredRegistrySource],
                  owner: parsed.owner,
                  name: parsed.name,
                })
              : `${parsed.owner}/${toExtensionTypePlural(parsed.type)}/${parsed.name}`;
        candidates.push({
          type: parsed.type,
          name: parsed.name,
          identity: dependencyIdentity,
          authority: "sourced",
          source:
            declaredSource === undefined
              ? `${fqn}@${constraint}`
              : `${declaredSource.url.href}#${fqn}@${constraint}`,
          enabled: true,
          constraint,
          origin: {
            type: "pack",
            pack: workspacePack ? `workspace:${identity.fqn}` : identity.fqn,
            manifestPath: document.relativePath,
            source: declaredSource?.url.href ?? fqn,
            sourceAuthority:
              declaredSource === undefined
                ? inheritedMemberAuthority
                : `registry:${declaredSource.url.href}`,
            constraint,
            enabled: true,
          },
        });
      }
    }

    const nodes = new Map<string, DesiredExtensionNode>();
    for (const candidate of candidates) {
      const key = nodeKey(candidate.type, candidate.name);
      const existing = nodes.get(key);
      if (existing === undefined) {
        nodes.set(
          key,
          candidate.authority === "sourced"
            ? {
                type: candidate.type,
                name: candidate.name,
                identity: candidate.identity,
                authority: "sourced",
                source: candidate.source,
                enabled: candidate.enabled,
                constraints: candidate.constraint === undefined ? [] : [candidate.constraint],
                origins: [candidate.origin],
              }
            : {
                type: "mcp-server",
                name: candidate.name,
                identity: candidate.identity,
                authority: "inline",
                enabled: candidate.enabled,
                constraints: [],
                origins: [candidate.origin],
              },
        );
        continue;
      }

      if (packageIdentity(existing.identity) !== packageIdentity(candidate.identity)) {
        problems.push({
          type: "projection-collision",
          extensionType: candidate.type,
          name: candidate.name,
          identities: [existing.identity, candidate.identity],
        });
        continue;
      }

      if (isInlineDesiredExtension(existing) || candidate.authority === "inline") {
        problems.push({
          type: "projection-collision",
          extensionType: candidate.type,
          name: candidate.name,
          identities: [existing.identity, candidate.identity],
        });
        continue;
      }

      const origins = [...existing.origins, candidate.origin];
      nodes.set(key, {
        ...existing,
        source: existing.origins.some((origin) => origin.type === "settings")
          ? existing.source
          : candidate.source,
        enabled: isDesiredExtensionActive(origins),
        constraints:
          candidate.constraint === undefined || existing.constraints.includes(candidate.constraint)
            ? existing.constraints
            : [...existing.constraints, candidate.constraint],
        origins,
      });
    }

    // Acquisition is settled; now bind the source-less settings entries to the
    // identities the Packs supplied. A preference never creates a node, never
    // adds a constraint, and never resurrects a member no reachable Pack
    // supplies — it only adjusts the member that is already there.
    for (const [key, preference] of preferences) {
      const node = nodes.get(key);
      if (node === undefined) {
        const [type, ...rest] = key.split(":");
        if (provenMembership.has(key) || membershipIncomplete) continue;
        problems.push({
          type: "member-configuration-unbound",
          extensionType: extensionTypes.find((candidate) => candidate === type) ?? "skill",
          name: rest.join(":"),
          location: preference.location,
        });
        continue;
      }
      nodes.set(key, {
        ...node,
        enabled: effectiveExtensionActivation(node.origins, preference),
        preference,
      });
    }

    const mcpClosuresByIdentity = new Map<string, DesiredMcpSourceClosure>();
    for (const node of nodes.values()) {
      if (node.type === "mcp-server" && isSourcedDesiredExtension(node)) {
        const existing = mcpClosuresByIdentity.get(node.identity);
        mcpClosuresByIdentity.set(node.identity, {
          identity: node.identity,
          localNames: [...(existing?.localNames ?? []), node.name].sort(),
          constraints: [
            ...(existing?.constraints ?? []),
            ...node.constraints.filter(
              (constraint) => !(existing?.constraints ?? []).includes(constraint),
            ),
          ],
          origins: [...(existing?.origins ?? []), ...node.origins],
        });
      }
    }

    const mcpSourceClosures = [...mcpClosuresByIdentity.values()].sort((left, right) =>
      left.identity.localeCompare(right.identity),
    );
    const settled = { nodes: [...nodes.values()], mcpSourceClosures };
    const effectiveByNode = new Map(
      settled.nodes.map((node) => [
        nodeKey(node.type, node.name),
        effectiveDesiredConstraint(settled, node),
      ]),
    );
    const reportedConflicts = new Set<string>();
    for (const node of settled.nodes) {
      const effective = effectiveByNode.get(nodeKey(node.type, node.name));
      if (effective === undefined || Result.isSuccess(effective)) continue;
      // Every local connection of one MCP source closure shares its conflict.
      const conflictKey = `${effective.failure.extensionType}:${effective.failure.name}`;
      if (reportedConflicts.has(conflictKey)) continue;
      reportedConflicts.add(conflictKey);
      problems.push(effective.failure);
    }

    const typeOrder = new Map(extensionTypes.map((type, index) => [type, index]));
    const orderedNodes = settled.nodes
      .map((node) => {
        if (isInlineDesiredExtension(node)) return node;
        const constraints =
          node.type === "mcp-server"
            ? (mcpClosuresByIdentity.get(node.identity)?.constraints ?? node.constraints)
            : node.constraints;
        const effective = effectiveByNode.get(nodeKey(node.type, node.name));
        const constraint =
          effective === undefined || Result.isFailure(effective)
            ? undefined
            : Option.getOrUndefined(effective.success.range);
        return {
          ...node,
          constraints,
          source:
            constraint === undefined
              ? node.source
              : node.type === "mcp-server"
                ? withVersionConstraint(node.source, constraint)
                : node.identity.startsWith("@")
                  ? `${node.identity}@${constraint}`
                  : node.source,
        };
      })
      .sort((left, right) => {
        const leftOrder = typeOrder.get(left.type) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = typeOrder.get(right.type) ?? Number.MAX_SAFE_INTEGER;
        return leftOrder === rightOrder
          ? left.name.localeCompare(right.name)
          : leftOrder - rightOrder;
      });

    return {
      complete: problems.length === 0,
      nodes: orderedNodes,
      mcpSourceClosures,
      problems,
    };
  });
