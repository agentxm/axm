import type { NativeMcpComponent } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import { discoverPluginMcpComponents } from "./plugin-mcp-components.js";
import { createHash } from "node:crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import {
  extensionTypeForManifestFilename,
  MANIFEST_FILENAME_BY_TYPE,
  extractSkillMetadata,
  skillDirectoryName,
  readExtensionManifest,
  validateManifestHasNoAgentsField,
  type ExtensionManifest,
  type ManifestIdentity,
} from "@agentxm/extension-content";
import {
  DISCOVERY_MAX_DEPTH,
  DISCOVERY_SKIPPED_DIRECTORIES,
} from "@agentxm/extension-model/unstable/discovery-walk";
import {
  decodeExtensionNameSync,
  type ExtensionName,
  type ExtensionType,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import type { DistributionDescriptor } from "@agentxm/extension-model/unstable/extensions/refs/ref-base";
import { readPluginDistribution, type PluginSkillDistribution } from "./plugin-distribution.js";
import { readPluginMarketplace } from "./plugin-marketplace.js";
import { SourceNotResolvable } from "./errors.js";
import { readSourceWorkspace } from "./source-workspace.js";

export interface ExtensionPackageFilter {
  readonly names: ReadonlyArray<string>;
  readonly owner: Option.Option<Handle>;
  readonly type: ExtensionType | "*";
}

/**
 * Whether a source puts a package forward as its own. A source holds the
 * packages it acquired from other publishers without offering them.
 */
export type SourceStanding = "offered" | "held";

export interface DiscoveredManifestExtensionPackage {
  readonly kind: "manifest";
  readonly standing: SourceStanding;
  readonly directory: string;
  readonly identity: ManifestIdentity;
  readonly manifest: ExtensionManifest;
}

export interface DiscoveredPortableSkillPackage {
  readonly kind: "portable-skill";
  readonly standing: SourceStanding;
  readonly directory: string;
  readonly sourcePath: string;
  readonly distribution?: DistributionDescriptor;
  readonly name: ExtensionName;
  readonly skill: SkillExtensionRef["skill"];
}

export interface DiscoveredPluginMcpPackage {
  readonly kind: "plugin-mcp";
  readonly standing: SourceStanding;
  readonly directory: string;
  readonly sourcePath: string;
  readonly distribution: DistributionDescriptor;
  readonly name: ExtensionName;
  readonly nativeComponent: NativeMcpComponent;
}

export type DiscoveredExtensionPackage =
  DiscoveredManifestExtensionPackage | DiscoveredPortableSkillPackage | DiscoveredPluginMcpPackage;

export const isManifestExtensionPackage = (
  candidate: DiscoveredExtensionPackage,
): candidate is DiscoveredManifestExtensionPackage => candidate.kind === "manifest";

const matchesFilter = (
  identity: {
    readonly owner: Handle;
    readonly type: ExtensionType;
    readonly name: ExtensionName;
  },
  filter: ExtensionPackageFilter,
): boolean =>
  (filter.type === "*" || filter.type === identity.type) &&
  (filter.names.length === 0 || filter.names.includes(identity.name)) &&
  (Option.isNone(filter.owner) || filter.owner.value === identity.owner);

const matchesPortableSkillFilter = (
  candidate: DiscoveredPortableSkillPackage,
  filter: ExtensionPackageFilter,
): boolean =>
  (filter.type === "*" || filter.type === "skill") &&
  (filter.names.length === 0 ||
    filter.names.some(
      (name) =>
        name === candidate.name ||
        name === candidate.sourcePath ||
        name === candidate.skill.displayName,
    )) &&
  Option.isNone(filter.owner);

export const inspectExtensionPackage = (
  directory: string,
  defaultOwner: Option.Option<Handle> = Option.none(),
  selectedType?: ExtensionType,
): Effect.Effect<
  DiscoveredManifestExtensionPackage,
  SourceNotResolvable,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const entries = yield* fs.readDirectory(directory).pipe(
      Effect.mapError(
        (cause) =>
          new SourceNotResolvable({
            category: "validation",
            detail: `AXM package directory could not be read: ${directory}`,
            cause,
          }),
      ),
    );
    const manifestEntries = entries
      .filter((entry) => {
        const type = extensionTypeForManifestFilename(entry);
        return type !== undefined && (selectedType === undefined || selectedType === type);
      })
      .sort();
    const manifestFile = manifestEntries[0];
    if (manifestFile === undefined) {
      return yield* new SourceNotResolvable({
        category: "validation",
        detail: `No AXM extension manifest was found at ${directory}; use skills import or subagents import for supported unmanaged/native content`,
      });
    }
    if (manifestEntries.length > 1) {
      return yield* new SourceNotResolvable({
        category: "validation",
        detail: `Multiple AXM extension manifests were found at ${directory}: ${manifestEntries.join(", ")}`,
      });
    }
    const type = extensionTypeForManifestFilename(manifestFile);
    if (type === undefined) {
      return yield* new SourceNotResolvable({
        category: "internal",
        detail: `Manifest type could not be determined for ${manifestFile}`,
      });
    }
    const { fileName, raw, manifest, identity } = yield* readExtensionManifest(
      directory,
      type,
      Option.isSome(defaultOwner) ? { defaultOwner: defaultOwner.value } : undefined,
    ).pipe(
      Effect.mapError(
        (cause) => new SourceNotResolvable({ category: "validation", detail: cause.detail, cause }),
      ),
    );
    yield* Effect.fromResult(validateManifestHasNoAgentsField(fileName, raw)).pipe(
      Effect.mapError(
        (cause) => new SourceNotResolvable({ category: "validation", detail: cause.detail, cause }),
      ),
    );
    return { kind: "manifest", standing: "offered", directory, identity, manifest };
  });

const sourceName = (value: string): ExtensionName => {
  const normalized = value.toLowerCase().replace(/[^a-z0-9-]+/gu, "-");
  let start = 0;
  while (normalized[start] === "-") start += 1;
  let end = Math.min(normalized.length, start + 64);
  while (end > start && normalized[end - 1] === "-") end -= 1;
  const base = normalized.slice(start, end);
  return decodeExtensionNameSync(
    base || `skill-${createHash("sha256").update(value).digest("hex").slice(0, 8)}`,
  );
};

const readPortableSkill = (
  directory: string,
  sourcePath: string,
  rootName: string,
  distribution?: DistributionDescriptor,
): Effect.Effect<
  Option.Option<DiscoveredPortableSkillPackage>,
  never,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const isAxmPackageContent =
      path.basename(directory) === "src" &&
      (yield* fs
        .exists(path.join(path.dirname(directory), MANIFEST_FILENAME_BY_TYPE.skill))
        .pipe(Effect.catch(() => Effect.succeed(false))));
    if (isAxmPackageContent) return Option.none<DiscoveredPortableSkillPackage>();
    const content = yield* fs.readFileString(path.join(directory, "SKILL.md")).pipe(Effect.option);
    if (Option.isNone(content)) return Option.none<DiscoveredPortableSkillPackage>();
    const parsed = extractSkillMetadata(content.value);
    const name = sourceName(
      sourcePath === "." ? skillDirectoryName(parsed.name, rootName) : path.basename(directory),
    );
    const metadata =
      typeof parsed.metadata === "object" &&
      parsed.metadata !== null &&
      !Array.isArray(parsed.metadata)
        ? yield* Schema.decodeUnknownEffect(Schema.Record(Schema.String, Schema.Unknown))(
            parsed.metadata,
          ).pipe(Effect.option)
        : Option.none<Readonly<Record<string, unknown>>>();
    return Option.some({
      kind: "portable-skill",
      standing: "offered",
      directory,
      sourcePath,
      name,
      ...(distribution === undefined ? {} : { distribution }),
      skill: {
        name,
        ...(parsed.name === undefined ? {} : { displayName: parsed.name }),
        description: Option.fromUndefinedOr(parsed.description),
        metadata,
      },
    });
  });

const distinctPortableNames = <Candidate extends DiscoveredExtensionPackage>(
  candidates: ReadonlyArray<Candidate>,
  taken: ReadonlySet<string> = new Set(),
): ReadonlyArray<Candidate> => {
  const names = new Map<string, number>();
  for (const candidate of candidates)
    if (candidate.kind === "portable-skill")
      names.set(candidate.name, (names.get(candidate.name) ?? 0) + 1);
  return candidates.map((candidate) => {
    if (
      candidate.kind !== "portable-skill" ||
      (names.get(candidate.name) === 1 && !taken.has(candidate.name))
    )
      return candidate;
    const suffix = createHash("sha256").update(candidate.sourcePath).digest("hex").slice(0, 8);
    const name = decodeExtensionNameSync(
      `${candidate.name.slice(0, 55).replace(/-+$/u, "")}-${suffix}`,
    );
    return { ...candidate, name, skill: { ...candidate.skill, name } };
  });
};

/** The key a workspace entry's distribution intent names a discovered package by. */
const distributionKey = (candidate: DiscoveredExtensionPackage): Option.Option<string> =>
  candidate.kind === "manifest"
    ? Option.some(`${candidate.identity.type}:${candidate.identity.name}`)
    : candidate.kind === "portable-skill"
      ? Option.some(`skill:${candidate.name}`)
      : Option.none();

const identityKey = (candidate: DiscoveredExtensionPackage): string =>
  candidate.kind === "manifest"
    ? `${candidate.identity.owner}:${candidate.identity.type}:${candidate.identity.name}`
    : candidate.kind === "portable-skill"
      ? `portable:skill:${candidate.sourcePath}`
      : `plugin:mcp:${candidate.sourcePath}:${candidate.nativeComponent.name}`;

const rejectAmbiguousDuplicates = (candidates: ReadonlyArray<DiscoveredExtensionPackage>) =>
  Effect.gen(function* () {
    const seen = new Set<string>();
    for (const candidate of candidates) {
      const key = identityKey(candidate);
      if (seen.has(key)) {
        return yield* new SourceNotResolvable({
          category: "validation",
          detail: `Multiple discovered extensions declare the same identity: ${key}`,
        });
      }
      seen.add(key);
    }
    return candidates;
  });

export const discoverExtensionPackages = (
  root: string,
  filter: ExtensionPackageFilter,
  options: { readonly rootName?: string } = {},
): Effect.Effect<
  ReadonlyArray<DiscoveredExtensionPackage>,
  SourceNotResolvable,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const exists = yield* fs.exists(root).pipe(
      Effect.mapError(
        (cause) =>
          new SourceNotResolvable({
            category: "validation",
            detail: `Source does not exist: ${root}`,
            cause,
          }),
      ),
    );
    if (!exists) {
      return [];
    }

    const resolvedRoot = path.resolve(root);
    const workspace = yield* readSourceWorkspace(resolvedRoot);

    /**
     * What one directory is, on its own evidence: the packages it declares
     * when it is a marketplace, a plugin, a manifest package, or a skill, and
     * nothing when it is only a folder that may contain them.
     */
    const look = (
      directory: string,
    ): Effect.Effect<
      {
        readonly entries: ReadonlyArray<string>;
        readonly packages: Option.Option<ReadonlyArray<DiscoveredExtensionPackage>>;
      },
      SourceNotResolvable
    > =>
      Effect.gen(function* () {
        const entries = yield* fs.readDirectory(directory).pipe(
          Effect.mapError(
            (cause) =>
              new SourceNotResolvable({
                category: "validation",
                detail: `Extension source directory could not be read: ${directory}`,
                cause,
              }),
          ),
        );
        const plugin = entries.includes("SKILL.md")
          ? Option.none()
          : yield* readPluginDistribution(directory).pipe(
              Effect.provideService(FileSystem.FileSystem, fs),
              Effect.provideService(Path.Path, path),
            );
        const components = (
          packageDirectory: string,
          distribution: PluginSkillDistribution,
          marketplace?: { readonly path: string; readonly name: string },
        ) =>
          Effect.gen(function* () {
            const skills = yield* Effect.forEach(distribution.skills, (skillPath) =>
              readPortableSkill(
                skillPath,
                path.relative(resolvedRoot, skillPath).split(path.sep).join("/") || ".",
                options.rootName ?? path.basename(resolvedRoot),
                {
                  format: distribution.format,
                  packageRoot:
                    path.relative(resolvedRoot, packageDirectory).split(path.sep).join("/") || ".",
                  componentPath:
                    path.relative(packageDirectory, skillPath).split(path.sep).join("/") || ".",
                  ...(distribution.manifestPath === undefined
                    ? {}
                    : { manifestPath: distribution.manifestPath }),
                  ...(marketplace === undefined
                    ? {}
                    : {
                        marketplace: {
                          path: path
                            .relative(resolvedRoot, marketplace.path)
                            .split(path.sep)
                            .join("/"),
                          name: marketplace.name,
                        },
                      }),
                },
              ).pipe(
                Effect.provideService(FileSystem.FileSystem, fs),
                Effect.provideService(Path.Path, path),
              ),
            ).pipe(
              Effect.map((candidates) =>
                candidates.flatMap((candidate) =>
                  Option.isSome(candidate) ? [candidate.value] : [],
                ),
              ),
            );
            const mcps =
              filter.type === "mcp-server" || filter.type === "*"
                ? yield* discoverPluginMcpComponents(packageDirectory, distribution)
                : [];
            const rootPath =
              path.relative(resolvedRoot, packageDirectory).split(path.sep).join("/") || ".";
            const components: DiscoveredPluginMcpPackage[] = mcps.map((nativeComponent) => ({
              kind: "plugin-mcp",
              standing: "offered",
              directory: packageDirectory,
              sourcePath: rootPath,
              name: sourceName(nativeComponent.name),
              nativeComponent,
              distribution: {
                format: distribution.format,
                packageRoot: rootPath,
                componentPath: ".",
                ...(distribution.manifestPath === undefined
                  ? {}
                  : { manifestPath: distribution.manifestPath }),
                ...(marketplace === undefined
                  ? {}
                  : {
                      marketplace: {
                        path: path
                          .relative(resolvedRoot, marketplace.path)
                          .split(path.sep)
                          .join("/"),
                        name: marketplace.name,
                      },
                    }),
              },
            }));
            return [...skills, ...components];
          }).pipe(
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provideService(Path.Path, path),
          );
        const marketplace =
          entries.includes("SKILL.md") ||
          (Option.isSome(plugin) && plugin.value.format === "agent-plugins")
            ? Option.none()
            : yield* readPluginMarketplace(directory, filter.names).pipe(
                Effect.provideService(FileSystem.FileSystem, fs),
                Effect.provideService(Path.Path, path),
              );
        if (Option.isSome(marketplace)) {
          const members = yield* Effect.forEach(marketplace.value, (member) =>
            Effect.gen(function* () {
              const distribution = yield* readPluginDistribution(
                member.directory,
                member.selection,
              );
              return Option.isNone(distribution)
                ? []
                : yield* components(member.directory, distribution.value, member.marketplace);
            }).pipe(
              Effect.provideService(FileSystem.FileSystem, fs),
              Effect.provideService(Path.Path, path),
            ),
          );
          return { entries, packages: Option.some(members.flat()) };
        }
        if (Option.isSome(plugin)) {
          return {
            entries,
            packages: Option.some(yield* components(directory, plugin.value)),
          };
        }

        const manifests = entries.filter(
          (entry) => extensionTypeForManifestFilename(entry) !== undefined,
        );
        if (manifests.length > 0) {
          const candidates = yield* Effect.forEach(manifests.sort(), (manifest) =>
            inspectExtensionPackage(
              directory,
              workspace.owner,
              extensionTypeForManifestFilename(manifest),
            ).pipe(
              Effect.provideService(FileSystem.FileSystem, fs),
              Effect.provideService(Path.Path, path),
            ),
          );
          return { entries, packages: Option.some(candidates) };
        }

        const portable = entries.includes("SKILL.md")
          ? yield* readPortableSkill(
              directory,
              path.relative(resolvedRoot, directory).split(path.sep).join("/") || ".",
              options.rootName ?? path.basename(resolvedRoot),
            ).pipe(
              Effect.provideService(FileSystem.FileSystem, fs),
              Effect.provideService(Path.Path, path),
            )
          : Option.none<DiscoveredPortableSkillPackage>();
        return {
          entries,
          packages: Option.map(portable, (skill) => [skill]),
        };
      });

    /** Which of a directory's entries are real directories, in order; links are not followed. */
    const folders = (
      directory: string,
      entries: ReadonlyArray<string>,
    ): Effect.Effect<ReadonlyArray<string>> =>
      Effect.forEach(
        [...entries].sort(),
        (entry) =>
          Effect.gen(function* () {
            const child = path.join(directory, entry);
            const link = yield* fs.readLink(child).pipe(Effect.option);
            if (Option.isSome(link)) return [];
            const info = yield* fs.stat(child).pipe(Effect.option);
            return Option.isNone(info) || info.value.type !== "Directory" ? [] : [child];
          }),
        { concurrency: 16 },
      ).pipe(Effect.map((children) => children.flat()));

    /** A broad walk does not descend into dependency trees, build output, or tool caches. */
    const walkable = (entries: ReadonlyArray<string>): ReadonlyArray<string> =>
      entries.filter((entry) => !DISCOVERY_SKIPPED_DIRECTORIES.has(entry));

    /** Every package at or beneath a directory, stopping below whatever is one. */
    const scan = (
      directory: string,
      depth: number,
      maxDepth: number,
    ): Effect.Effect<ReadonlyArray<DiscoveredExtensionPackage>, SourceNotResolvable> =>
      Effect.gen(function* () {
        if (depth > maxDepth) return [];
        const { entries, packages } = yield* look(directory);
        if (Option.isSome(packages)) return packages.value;
        if (depth === maxDepth) return [];
        const children = yield* Effect.forEach(
          yield* folders(directory, walkable(entries)),
          (child) => scan(child, depth + 1, maxDepth),
          { concurrency: 16 },
        );
        return children.flat();
      });

    /** The packages directly inside one root a workspace authors a type in. */
    const authoredIn = (
      directory: string,
    ): Effect.Effect<ReadonlyArray<DiscoveredExtensionPackage>, SourceNotResolvable> =>
      Effect.gen(function* () {
        const [authoredRoot] = yield* folders(path.dirname(directory), [path.basename(directory)]);
        if (authoredRoot === undefined) return [];
        const entries = yield* fs.readDirectory(authoredRoot).pipe(
          Effect.mapError(
            (cause) =>
              new SourceNotResolvable({
                category: "validation",
                detail: `Extension source directory could not be read: ${authoredRoot}`,
                cause,
              }),
          ),
        );
        const children = yield* Effect.forEach(
          yield* folders(authoredRoot, entries),
          (child) =>
            look(child).pipe(Effect.map(({ packages }) => Option.getOrElse(packages, () => []))),
          { concurrency: 16 },
        );
        return children.flat();
      });

    const top = yield* look(resolvedRoot);
    const own = yield* Option.match(top.packages, {
      // The root is itself a package, so its layout is the publisher's own.
      onSome: (packages) => Effect.succeed({ authored: packages, acquired: [] }),
      onNone: () =>
        Effect.gen(function* () {
          const [heldRoot] = yield* folders(resolvedRoot, [path.basename(workspace.heldRoot)]);
          const acquired =
            heldRoot === undefined ? [] : yield* scan(heldRoot, 0, Number.POSITIVE_INFINITY);
          const authored = yield* Option.match(workspace.authoredRoots, {
            // A workspace has said where it authors; nothing else is its offer.
            onSome: (roots) =>
              Effect.forEach(roots, ({ directory }) => authoredIn(directory), {
                concurrency: 16,
              }),
            onNone: () =>
              Effect.gen(function* () {
                const children = yield* folders(resolvedRoot, walkable(top.entries));
                return yield* Effect.forEach(
                  children.filter((child) => child !== heldRoot),
                  (child) => scan(child, 1, DISCOVERY_MAX_DEPTH),
                  { concurrency: 16 },
                );
              }),
          });
          return { authored: authored.flat(), acquired };
        }),
    });

    const offered = distinctPortableNames(
      own.authored.filter((candidate) =>
        Option.match(distributionKey(candidate), {
          onNone: () => true,
          onSome: (key) => !workspace.distributionOptOuts.has(key),
        }),
      ),
    );
    // A package the source both authors and holds a copy of is the source's own.
    const offeredIdentities = new Set(offered.map(identityKey));
    const held = distinctPortableNames(
      own.acquired
        .filter((candidate) => !offeredIdentities.has(identityKey(candidate)))
        .map((candidate) => ({ ...candidate, standing: "held" as const })),
      new Set(
        offered.flatMap((candidate) =>
          candidate.kind === "portable-skill" ? [candidate.name] : [],
        ),
      ),
    );
    const candidates = [...offered, ...held];
    const sorted = candidates
      .filter((candidate) =>
        candidate.kind === "manifest"
          ? matchesFilter(candidate.identity, filter)
          : candidate.kind === "portable-skill"
            ? matchesPortableSkillFilter(candidate, filter)
            : (filter.type === "*" || filter.type === "mcp-server") &&
              Option.isNone(filter.owner) &&
              (filter.names.length === 0 ||
                filter.names.some(
                  (name) =>
                    name === candidate.name ||
                    name === candidate.nativeComponent.name ||
                    name === `${candidate.sourcePath}#${candidate.nativeComponent.name}`,
                )),
      )
      .sort((left, right) => left.directory.localeCompare(right.directory));
    return yield* rejectAmbiguousDuplicates(sorted);
  });
