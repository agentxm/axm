import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as semver from "semver";
import {
  extensionTypes,
  parseExtensionFqnParts,
  parseRegistrySourceRef,
  toExtensionTypePlural,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  PACK_MANIFEST_FILENAME,
  PackManifestSchema,
} from "@agentxm/extension-model/unstable/packs/manifest-schema";
import type { PackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import { computePackPathsForLayout } from "./pack-paths.js";
import type { Settings } from "../settings/index.js";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import { isDesiredExtensionActive } from "./desired-state-enabled.js";
import { configuredAuthoredDirectory, type WorkspaceLayout } from "./layout.js";
import { SETTINGS_FILENAME } from "@agentxm/extension-model/unstable/workspace-files";
import { ACQUIRED_EXTENSIONS_DIR } from "./constants.js";
import { intersectVersionConstraints } from "@agentxm/extension-model/unstable/version-constraints";
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
      readonly constraint: string;
      readonly enabled: boolean;
    };

interface DesiredExtensionNodeCommon {
  readonly type: ExtensionType;
  readonly name: string;
  readonly identity: string;
  readonly enabled: boolean;
  readonly constraints: ReadonlyArray<string>;
  readonly origins: ReadonlyArray<DesiredExtensionOrigin>;
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
    };

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
  readonly baseDir: string;
  readonly settings: Settings;
  readonly layout?: WorkspaceLayout;
  /** Resolved Pack roots whose manifests supersede the currently materialized copy. */
  readonly prospectivePacks?: ReadonlyArray<ProspectivePackRef>;
  /** Registry source aliases mapped to their stable authority endpoints. */
  readonly registryAuthorities?: Readonly<Record<string, URL | string>>;
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

const nodeKey = (type: ExtensionType, name: string): string => `${type}:${name}`;

const packageIdentity = (identity: string): string =>
  identity.startsWith("workspace:") ? identity.slice("workspace:".length) : identity;

const registryLocator = (
  source: string,
): { readonly sourceName: string; readonly ref: string } | undefined => {
  if (source.startsWith("@")) return { sourceName: "agentxm", ref: source };
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
  registryAuthorities: Readonly<Record<string, URL | string>>,
): { readonly identity: string; readonly constraint?: string } => {
  if (isWorkspaceSourceLocator(source)) {
    return settings.owner === undefined
      ? { identity: source }
      : { identity: `workspace:${settings.owner}/${toExtensionTypePlural(type)}/${name}` };
  }

  const locator = registryLocator(source);
  const parsed = locator === undefined ? undefined : parseRegistrySourceRef(locator.ref);
  if (parsed !== undefined && parsed.type === toExtensionTypePlural(type)) {
    const registryAuthority =
      locator === undefined ? undefined : registryAuthorities[locator.sourceName];
    return {
      identity:
        type === "mcp-server" && registryAuthority !== undefined
          ? mcpRegistryResolutionKey({
              authority: registryAuthority,
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
): PackIdentity | undefined => {
  if (isWorkspaceSourceLocator(source)) {
    if (settings.owner === undefined) return undefined;
    return {
      owner: settings.owner,
      name: settingsName,
      fqn: `${settings.owner}/packs/${settingsName}`,
    };
  }

  const locator = registryLocator(source);
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

  return undefined;
};

export const collectDesiredConstraintContributors = (
  _path: Path.Path,
  origins: ReadonlyArray<DesiredExtensionOrigin>,
): ReadonlyArray<DesiredConstraintContributor> =>
  origins
    .flatMap((origin): ReadonlyArray<DesiredConstraintContributor> => {
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
          dependingPack: origin.pack.replace(/^workspace:/, ""),
          range: origin.constraint,
          location: origin.manifestPath,
        },
      ];
    })
    .sort((left, right) => {
      const byPack = (left.dependingPack ?? "").localeCompare(right.dependingPack ?? "");
      if (byPack !== 0) return byPack;
      const byRange = left.range.localeCompare(right.range);
      return byRange === 0 ? left.location.localeCompare(right.location) : byRange;
    });

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
  baseDir,
  settings,
  layout,
  prospectivePacks = [],
  registryAuthorities = {},
}: DesiredStateGraphArgs): Effect.Effect<
  DesiredStateGraph,
  never,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const candidates: Candidate[] = [];
    const problems: DesiredStateProblem[] = [];
    const prospectivePacksByIdentity = new Map(
      prospectivePacks.map((ref) => [`${ref.owner}/packs/${ref.pack.name}`, ref]),
    );

    const addSettingsEntries = (
      type: Exclude<ExtensionType, "pack">,
      entries:
        | Readonly<
            Record<
              string,
              {
                readonly source: string;
                readonly enabled: boolean;
                readonly origin?: "bundled";
              }
            >
          >
        | undefined,
    ) => {
      for (const [name, entry] of Object.entries(entries ?? {})) {
        const bundled = type === "skill" && entry.origin === "bundled";
        const identity = bundled
          ? { identity: `bundled:@agentxm/skills/${name}` }
          : sourceIdentity(type, name, entry.source, settings, registryAuthorities);
        if (!bundled && isWorkspaceSourceLocator(entry.source) && settings.owner === undefined) {
          problems.push({ type: "workspace-owner-missing", extensionType: type, name });
        }
        candidates.push({
          type,
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
    };

    addSettingsEntries("skill", settings.skills);
    for (const [name, entry] of Object.entries(settings.mcpServers ?? {})) {
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
      const identity = sourceIdentity(
        "mcp-server",
        name,
        entry.source,
        settings,
        registryAuthorities,
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
      const identity = packIdentity(settingsName, entry.source, settings);
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

      const workspacePack = isWorkspaceSourceLocator(entry.source);
      const configuredRegistrySource = registryLocator(entry.source)?.sourceName ?? "agentxm";
      const manifestPath = path.join(
        layout === undefined
          ? path.join(
              baseDir,
              workspacePack
                ? configuredAuthoredDirectory(settings, "pack")
                : path.join(
                    ACQUIRED_EXTENSIONS_DIR,
                    configuredRegistrySource,
                    identity.owner,
                    "packs",
                  ),
              identity.name,
            )
          : computePackPathsForLayout(
              path.join,
              layout,
              workspacePack ? "workspace" : configuredRegistrySource,
              identity.owner,
              identity.name,
            ).canonicalPath,
        PACK_MANIFEST_FILENAME,
      );
      const prospective = prospectivePacksByIdentity.get(identity.fqn);
      const manifest = yield* prospective === undefined
        ? Effect.gen(function* () {
            const readResult = yield* Effect.result(fs.readFileString(manifestPath));
            if (Result.isFailure(readResult)) {
              problems.push({
                type: "pack-manifest-unavailable",
                pack: identity.fqn,
                path: manifestPath,
              });
              return undefined;
            }

            const decoded = parsePackManifest(readResult.success);
            if (decoded === undefined) {
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
      if (manifest === undefined) continue;
      if (
        manifest.owner !== identity.owner ||
        manifest.name !== identity.name ||
        (identity.constraint !== undefined &&
          !semver.satisfies(manifest.version, identity.constraint))
      ) {
        problems.push({
          type: "pack-identity-mismatch",
          pack: identity.fqn,
          path: manifestPath,
          detail: `Expected ${identity.fqn}${identity.constraint === undefined ? "" : `@${identity.constraint}`}, found ${manifest.owner}/packs/${manifest.name}@${manifest.version}.`,
        });
        continue;
      }

      for (const [fqn, constraint] of Object.entries(manifest.dependencies)) {
        const parsed = parseExtensionFqnParts(fqn);
        if (parsed === undefined || parsed.type === "pack") continue;
        const dependencyIdentity =
          parsed.type === "mcp-server" &&
          registryAuthorities[configuredRegistrySource] !== undefined
            ? mcpRegistryResolutionKey({
                authority: registryAuthorities[configuredRegistrySource],
                owner: parsed.owner,
                name: parsed.name,
              })
            : `${parsed.owner}/${toExtensionTypePlural(parsed.type)}/${parsed.name}`;
        candidates.push({
          type: parsed.type,
          name: parsed.name,
          identity: dependencyIdentity,
          authority: "sourced",
          source: `${fqn}@${constraint}`,
          enabled: entry.enabled !== false,
          constraint,
          origin: {
            type: "pack",
            pack: workspacePack ? `workspace:${identity.fqn}` : identity.fqn,
            manifestPath: path.relative(baseDir, manifestPath),
            source: fqn,
            constraint,
            enabled: entry.enabled !== false,
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
        continue;
      }
      if (intersectVersionConstraints(node.constraints) === undefined) {
        problems.push({
          type: "constraint-conflict",
          extensionType: node.type,
          name: node.name,
          constraints: node.constraints,
          contributors: collectDesiredConstraintContributors(path, node.origins),
        });
      }
    }

    const mcpSourceClosures = [...mcpClosuresByIdentity.values()].sort((left, right) =>
      left.identity.localeCompare(right.identity),
    );
    for (const closure of mcpSourceClosures) {
      if (intersectVersionConstraints(closure.constraints) === undefined) {
        problems.push({
          type: "constraint-conflict",
          extensionType: "mcp-server",
          name: closure.localNames.join(", "),
          constraints: closure.constraints,
          contributors: collectDesiredConstraintContributors(path, closure.origins),
        });
      }
    }

    const typeOrder = new Map(extensionTypes.map((type, index) => [type, index]));
    const orderedNodes = [...nodes.values()]
      .map((node) => {
        if (isInlineDesiredExtension(node)) return node;
        const constraints =
          node.type === "mcp-server"
            ? (mcpClosuresByIdentity.get(node.identity)?.constraints ?? node.constraints)
            : node.constraints;
        const constraint = intersectVersionConstraints(constraints);
        return {
          ...node,
          constraints,
          source:
            constraints.length > 0 && constraint !== undefined
              ? node.type === "mcp-server"
                ? withVersionConstraint(node.source, constraint)
                : node.identity.startsWith("@")
                  ? `${node.identity}@${constraint}`
                  : node.source
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
