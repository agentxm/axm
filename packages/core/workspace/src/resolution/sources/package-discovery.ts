import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import {
  extensionTypeForManifestFilename,
  MANIFEST_FILENAME_BY_TYPE,
  ManifestIdentitySchema,
  manifestFilenameForType,
  manifestSchemaForType,
  parseSkillMd,
  validateManifestHasNoAgentsField,
  type ExtensionManifest,
  type ManifestIdentity,
} from "@agentxm/extension-content";
import {
  DISCOVERY_MAX_DEPTH,
  DISCOVERY_SKIPPED_DIRECTORIES,
} from "@agentxm/extension-model/unstable/discovery-walk";
import {
  type ExtensionName,
  type ExtensionType,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import { HandleSchema } from "@agentxm/extension-model/unstable/extensions/handle";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import { SourceNotResolvable } from "./errors.js";

export interface ExtensionPackageFilter {
  readonly names: ReadonlyArray<string>;
  readonly owner: Option.Option<Handle>;
  readonly type: ExtensionType | "*";
}

export interface DiscoveredManifestExtensionPackage {
  readonly kind: "manifest";
  readonly directory: string;
  readonly identity: ManifestIdentity;
  readonly manifest: ExtensionManifest;
}

export interface DiscoveredPortableSkillPackage {
  readonly kind: "portable-skill";
  readonly directory: string;
  readonly name: ExtensionName;
  readonly skill: SkillExtensionRef["skill"];
}

export type DiscoveredExtensionPackage =
  DiscoveredManifestExtensionPackage | DiscoveredPortableSkillPackage;

export const isManifestExtensionPackage = (
  candidate: DiscoveredExtensionPackage,
): candidate is DiscoveredManifestExtensionPackage => candidate.kind === "manifest";

const DistributionEntrySchema = Schema.Union([
  Schema.String,
  Schema.Struct({
    source: Schema.optionalKey(Schema.String),
    distribute: Schema.optionalKey(Schema.Boolean),
  }),
]);

const DistributionMapSchema = Schema.Record(Schema.String, DistributionEntrySchema);

const SourceSettingsSchema = Schema.Struct({
  owner: Schema.optionalKey(HandleSchema),
  skills: Schema.optionalKey(DistributionMapSchema),
  mcpServers: Schema.optionalKey(DistributionMapSchema),
  subagents: Schema.optionalKey(DistributionMapSchema),
  rules: Schema.optionalKey(DistributionMapSchema),
  hooks: Schema.optionalKey(DistributionMapSchema),
  knowledge: Schema.optionalKey(DistributionMapSchema),
  packs: Schema.optionalKey(DistributionMapSchema),
});

interface SourceSettings {
  readonly owner: Option.Option<Handle>;
  readonly distributionOptOuts: ReadonlySet<string>;
}

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
  (filter.names.length === 0 || filter.names.includes(candidate.name)) &&
  Option.isNone(filter.owner);

const readSourceSettings = (
  root: string,
): Effect.Effect<SourceSettings, SourceNotResolvable, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const settingsPath = path.join(root, "axm.json");
    const exists = yield* fs.exists(settingsPath).pipe(
      Effect.mapError(
        (cause) =>
          new SourceNotResolvable({
            category: "validation",
            detail: `Source settings could not be inspected: ${settingsPath}`,
            cause,
          }),
      ),
    );
    if (!exists) {
      return { owner: Option.none<Handle>(), distributionOptOuts: new Set<string>() };
    }

    const text = yield* fs.readFileString(settingsPath).pipe(
      Effect.mapError(
        (cause) =>
          new SourceNotResolvable({
            category: "validation",
            detail: `Source settings could not be read: ${settingsPath}`,
            cause,
          }),
      ),
    );
    const raw = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(text).pipe(
      Effect.mapError(
        (cause) =>
          new SourceNotResolvable({
            category: "validation",
            detail: `Source settings contain invalid JSON: ${settingsPath}`,
            cause,
          }),
      ),
    );
    const settings = yield* Schema.decodeUnknownEffect(SourceSettingsSchema)(raw).pipe(
      Effect.mapError(
        (cause) =>
          new SourceNotResolvable({
            category: "validation",
            detail: `Source settings contain an invalid owner: ${settingsPath}`,
            cause,
          }),
      ),
    );
    const distributionOptOuts = new Set<string>();
    const collect = (
      type: ExtensionType,
      entries: Readonly<Record<string, typeof DistributionEntrySchema.Type>> | undefined,
    ) => {
      for (const [name, entry] of Object.entries(entries ?? {})) {
        if (
          typeof entry !== "string" &&
          entry.source === "workspace" &&
          entry.distribute === false
        ) {
          distributionOptOuts.add(`${type}:${name}`);
        }
      }
    };
    collect("skill", settings.skills);
    collect("mcp-server", settings.mcpServers);
    collect("subagent", settings.subagents);
    collect("rule", settings.rules);
    collect("hook", settings.hooks);
    collect("knowledge", settings.knowledge);
    collect("pack", settings.packs);
    return {
      owner: Option.fromUndefinedOr(settings.owner),
      distributionOptOuts,
    };
  });

const withDefaultOwner = (raw: unknown, defaultOwner: Option.Option<Handle>): unknown => {
  if (
    Option.isSome(defaultOwner) &&
    typeof raw === "object" &&
    raw !== null &&
    !Array.isArray(raw) &&
    !Object.hasOwn(raw, "owner")
  ) {
    return { ...raw, owner: defaultOwner.value };
  }
  return raw;
};

export const inspectExtensionPackage = (
  directory: string,
  defaultOwner: Option.Option<Handle> = Option.none(),
): Effect.Effect<
  DiscoveredManifestExtensionPackage,
  SourceNotResolvable,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
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
      .filter((entry) => extensionTypeForManifestFilename(entry) !== undefined)
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
    const manifestPath = path.join(directory, manifestFile);
    const text = yield* fs.readFileString(manifestPath).pipe(
      Effect.mapError(
        (cause) =>
          new SourceNotResolvable({
            category: "validation",
            detail: `AXM manifest could not be read: ${manifestPath}`,
            cause,
          }),
      ),
    );
    const parsed = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(
      text,
    ).pipe(
      Effect.mapError(
        (cause) =>
          new SourceNotResolvable({
            category: "validation",
            detail: `AXM manifest contains invalid JSON: ${manifestPath}`,
            cause,
          }),
      ),
    );
    const raw = withDefaultOwner(parsed, defaultOwner);
    yield* Effect.fromResult(validateManifestHasNoAgentsField(manifestFile, raw)).pipe(
      Effect.mapError(
        (cause) => new SourceNotResolvable({ category: "validation", detail: cause.detail, cause }),
      ),
    );
    const manifest = yield* Schema.decodeUnknownEffect(manifestSchemaForType(type))(raw).pipe(
      Effect.mapError(
        (cause) =>
          new SourceNotResolvable({
            category: "validation",
            detail: `AXM manifest does not conform to ${manifestFile}: ${manifestPath}`,
            cause,
          }),
      ),
    );
    const identity = yield* Schema.decodeUnknownEffect(ManifestIdentitySchema)(manifest).pipe(
      Effect.mapError(
        (cause) =>
          new SourceNotResolvable({
            category: "validation",
            detail: `AXM manifest identity is invalid: ${manifestPath}`,
            cause,
          }),
      ),
    );
    if (identity.type !== type || manifestFilenameForType(identity.type) !== manifestFile) {
      return yield* new SourceNotResolvable({
        category: "validation",
        detail: `AXM manifest filename and declared type disagree: ${manifestPath}`,
      });
    }
    return { kind: "manifest", directory, identity, manifest };
  });

const readPortableSkill = (
  directory: string,
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
    const parsed = parseSkillMd(content.value, path.basename(directory));
    if (Option.isNone(parsed)) return Option.none<DiscoveredPortableSkillPackage>();
    const name = yield* Schema.decodeUnknownEffect(ManifestIdentitySchema.fields.name)(
      parsed.value.name,
    ).pipe(Effect.option);
    if (Option.isNone(name)) return Option.none<DiscoveredPortableSkillPackage>();
    return Option.some({
      kind: "portable-skill",
      directory,
      name: name.value,
      skill: {
        name: name.value,
        description: Option.some(parsed.value.description),
        metadata: parsed.value.metadata,
      },
    });
  });

const identityKey = (candidate: DiscoveredExtensionPackage): string =>
  candidate.kind === "manifest"
    ? `${candidate.identity.owner}:${candidate.identity.type}:${candidate.identity.name}`
    : `portable:skill:${candidate.name}`;

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
    const sourceSettings = yield* readSourceSettings(resolvedRoot);
    const scan = (
      directory: string,
      depth: number,
    ): Effect.Effect<ReadonlyArray<DiscoveredExtensionPackage>, SourceNotResolvable> =>
      Effect.gen(function* () {
        if (depth > DISCOVERY_MAX_DEPTH) return [];
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
        const manifests = entries.filter(
          (entry) => extensionTypeForManifestFilename(entry) !== undefined,
        );
        if (manifests.length > 0) {
          const candidate = yield* inspectExtensionPackage(directory, sourceSettings.owner).pipe(
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provideService(Path.Path, path),
          );
          const distributionKey = `${candidate.identity.type}:${candidate.identity.name}`;
          return matchesFilter(candidate.identity, filter) &&
            !sourceSettings.distributionOptOuts.has(distributionKey)
            ? [candidate]
            : [];
        }

        const portable = entries.includes("SKILL.md")
          ? yield* readPortableSkill(directory).pipe(
              Effect.provideService(FileSystem.FileSystem, fs),
              Effect.provideService(Path.Path, path),
            )
          : Option.none<DiscoveredPortableSkillPackage>();
        const current =
          Option.isSome(portable) &&
          matchesPortableSkillFilter(portable.value, filter) &&
          !sourceSettings.distributionOptOuts.has(`skill:${portable.value.name}`)
            ? [portable.value]
            : [];
        if (depth === DISCOVERY_MAX_DEPTH) return current;

        const children = yield* Effect.forEach(
          entries.filter((entry) => !DISCOVERY_SKIPPED_DIRECTORIES.has(entry)).sort(),
          (entry) =>
            Effect.gen(function* () {
              const child = path.join(directory, entry);
              const link = yield* fs.readLink(child).pipe(Effect.option);
              if (Option.isSome(link)) return [];
              const info = yield* fs.stat(child).pipe(Effect.option);
              if (Option.isNone(info) || info.value.type !== "Directory") return [];
              return yield* scan(child, depth + 1);
            }),
          { concurrency: 16 },
        );
        return [...current, ...children.flat()];
      });

    const candidates = yield* scan(resolvedRoot, 0);
    const sorted = [...candidates].sort((left, right) =>
      left.directory.localeCompare(right.directory),
    );
    return yield* rejectAmbiguousDuplicates(sorted);
  });
