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
} from "../extensions/index.js";
import type { Handle } from "../extensions/handle.js";
import { PACK_MANIFEST_FILENAME, PackManifestSchema } from "../packs/manifest-schema.js";
import { computePackPaths } from "../packs/paths.js";
import type { Settings } from "../settings/index.js";
import { isWorkspaceSourceLocator } from "../sources/index.js";
import { isDesiredExtensionActive } from "./desired-state-enabled.js";

export type DesiredExtensionOrigin =
  | {
      readonly type: "settings";
      readonly source: string;
      readonly enabled: boolean;
      readonly constraint?: string;
    }
  | {
      readonly type: "pack";
      readonly pack: string;
      readonly source: string;
      readonly constraint: string;
      readonly enabled: boolean;
    };

export interface DesiredExtensionNode {
  readonly type: ExtensionType;
  readonly name: string;
  readonly identity: string;
  readonly source: string;
  readonly enabled: boolean;
  readonly constraints: ReadonlyArray<string>;
  readonly origins: ReadonlyArray<DesiredExtensionOrigin>;
}

export interface DesiredConstraintContributor {
  readonly source: "settings" | "pack";
  readonly range: string;
  readonly location: string;
  readonly dependingPack?: string;
}

export type DesiredStateProblem =
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
  readonly problems: ReadonlyArray<DesiredStateProblem>;
}

interface DesiredStateGraphArgs {
  readonly baseDir: string;
  readonly settings: Settings;
}

interface Candidate {
  readonly type: ExtensionType;
  readonly name: string;
  readonly identity: string;
  readonly source: string;
  readonly enabled: boolean;
  readonly constraint?: string;
  readonly origin: DesiredExtensionOrigin;
}

interface PackIdentity {
  readonly owner: Handle;
  readonly name: string;
  readonly fqn: string;
  readonly constraint?: string;
}

const nodeKey = (type: ExtensionType, name: string): string => `${type}:${name}`;

const packageIdentity = (identity: string): string =>
  identity.startsWith("workspace:") ? identity.slice("workspace:".length) : identity;

const sourceIdentity = (
  type: ExtensionType,
  name: string,
  source: string,
): { readonly identity: string; readonly constraint?: string } => {
  if (isWorkspaceSourceLocator(source)) {
    const parsed = parseExtensionFqnParts(source.slice("workspace:".length));
    if (parsed !== undefined && parsed.type === type && parsed.name === name) {
      return {
        identity: `workspace:${parsed.owner}/${toExtensionTypePlural(parsed.type)}/${parsed.name}`,
      };
    }
    return { identity: source };
  }

  const parsed = parseRegistrySourceRef(source);
  if (parsed !== undefined && parsed.type === toExtensionTypePlural(type)) {
    return {
      identity: `${parsed.owner}/${parsed.type}/${parsed.name}`,
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
    const parsed = parseExtensionFqnParts(source.slice("workspace:".length));
    if (parsed === undefined || parsed.type !== "pack") return undefined;
    return {
      owner: parsed.owner,
      name: parsed.name,
      fqn: `${parsed.owner}/packs/${parsed.name}`,
    };
  }

  const parsed = parseRegistrySourceRef(source);
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

const intersectConstraints = (constraints: ReadonlyArray<string>): string | undefined => {
  let intersections = [""];
  for (const constraint of constraints) {
    const validRange = semver.validRange(constraint);
    if (validRange === null) return undefined;
    const range = new semver.Range(validRange);
    intersections = intersections.flatMap((current) =>
      range.set.flatMap((comparators) => {
        const candidate = [current, ...comparators.map((comparator) => comparator.value)]
          .filter((part) => part.length > 0)
          .join(" ");
        return semver.minVersion(candidate) === null ? [] : [candidate];
      }),
    );
    if (intersections.length === 0) return undefined;
  }
  return intersections.join(" || ");
};

export const collectDesiredConstraintContributors = (
  path: Path.Path,
  origins: ReadonlyArray<DesiredExtensionOrigin>,
): ReadonlyArray<DesiredConstraintContributor> =>
  origins
    .flatMap((origin): ReadonlyArray<DesiredConstraintContributor> => {
      if (origin.constraint === undefined) return [];
      if (origin.type === "settings") {
        return [
          {
            source: "settings",
            range: origin.constraint,
            location: path.join(".axm", "settings.json"),
          },
        ];
      }
      const parsed = parseExtensionFqnParts(origin.pack.replace(/^workspace:/, ""));
      const location =
        parsed === undefined || parsed.type !== "pack"
          ? path.join(".axm", "extensions")
          : path.join(
              ".axm",
              "extensions",
              parsed.owner,
              "packs",
              parsed.name,
              PACK_MANIFEST_FILENAME,
            );
      return [
        {
          source: "pack",
          dependingPack: origin.pack.replace(/^workspace:/, ""),
          range: origin.constraint,
          location,
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

    const addSettingsEntries = (
      type: Exclude<ExtensionType, "pack">,
      entries:
        | Readonly<Record<string, { readonly source: string; readonly enabled: boolean }>>
        | undefined,
    ) => {
      for (const [name, entry] of Object.entries(entries ?? {})) {
        const identity = sourceIdentity(type, name, entry.source);
        candidates.push({
          type,
          name,
          identity: identity.identity,
          source: entry.source,
          enabled: entry.enabled,
          ...(identity.constraint === undefined ? {} : { constraint: identity.constraint }),
          origin: {
            type: "settings",
            source: entry.source,
            enabled: entry.enabled,
            ...(identity.constraint === undefined ? {} : { constraint: identity.constraint }),
          },
        });
      }
    };

    addSettingsEntries("skill", settings.skills);
    addSettingsEntries("mcp-server", settings.mcpServers);
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
        source: entry.source,
        enabled: entry.enabled !== false,
        ...(identity.constraint === undefined ? {} : { constraint: identity.constraint }),
        origin: {
          type: "settings",
          source: entry.source,
          enabled: entry.enabled !== false,
          ...(identity.constraint === undefined ? {} : { constraint: identity.constraint }),
        },
      });

      const manifestPath = path.join(
        computePackPaths(path.join, baseDir, identity.owner, identity.name).canonicalPath,
        PACK_MANIFEST_FILENAME,
      );
      const readResult = yield* Effect.result(fs.readFileString(manifestPath));
      if (Result.isFailure(readResult)) {
        problems.push({
          type: "pack-manifest-unavailable",
          pack: identity.fqn,
          path: manifestPath,
        });
        continue;
      }

      const decoded = parsePackManifest(readResult.success);
      if (decoded === undefined) {
        problems.push({
          type: "pack-manifest-invalid",
          pack: identity.fqn,
          path: manifestPath,
        });
        continue;
      }

      const manifest = decoded;
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
        candidates.push({
          type: parsed.type,
          name: parsed.name,
          identity: `${parsed.owner}/${toExtensionTypePlural(parsed.type)}/${parsed.name}`,
          source: `${fqn}@${constraint}`,
          enabled: entry.enabled !== false,
          constraint,
          origin: {
            type: "pack",
            pack: identity.fqn,
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
        nodes.set(key, {
          type: candidate.type,
          name: candidate.name,
          identity: candidate.identity,
          source: candidate.source,
          enabled: candidate.enabled,
          constraints: candidate.constraint === undefined ? [] : [candidate.constraint],
          origins: [candidate.origin],
        });
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

    for (const node of nodes.values()) {
      if (intersectConstraints(node.constraints) === undefined) {
        problems.push({
          type: "constraint-conflict",
          extensionType: node.type,
          name: node.name,
          constraints: node.constraints,
          contributors: collectDesiredConstraintContributors(path, node.origins),
        });
      }
    }

    const typeOrder = new Map(extensionTypes.map((type, index) => [type, index]));
    const orderedNodes = [...nodes.values()]
      .map((node) => {
        const constraint = intersectConstraints(node.constraints);
        return {
          ...node,
          source:
            node.identity.startsWith("@") && node.constraints.length > 0 && constraint !== undefined
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
      problems,
    };
  });
