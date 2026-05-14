/**
 * Local filesystem-backed registry client.
 *
 * All operations read/write files relative to a registry root using the
 * layout: `<root>/extensions/@<owner>/<type>/<name>/`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import {
  errPublishConflict,
  errRegistryPublishRejected,
  makeAppError,
  type AppError,
} from "../app-error/index.js";
import type {
  RegistryClient,
  RegistryExtensionManifest,
  GetExtensionPackageArgs,
  PublishExtensionArgs,
  ExtensionExistsArgs,
  GetExtensionsByOwnerResponse,
  DiscoverExtensionsArgs,
} from "./client.js";
import { toAuthor, type Author, type ExtensionType } from "../extensions/index.js";
import { isExtensionTypePlural, parseExtensionSpecParts } from "../extensions/common.js";
import {
  companionPackagesToPackageUrlParts,
  ExtensionIndexSchema,
  type ExtensionIndex,
} from "./schema.js";
import type { DiscoverExtensionEntry, DiscoverExtensionsResponse } from "./discover-schema.js";
import { purlMatch } from "../packaging/purl-match.js";
import { extensionDir, pluralizeType, resolveVersionEntry, selectVersion } from "./utils.js";

const decodeExtensionIndexFromJsonString = Schema.decodeUnknownEffect(
  Schema.fromJsonString(ExtensionIndexSchema),
);
const encodeExtensionIndexToJsonString = Schema.encodeSync(
  Schema.fromJsonString(ExtensionIndexSchema),
);

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const readExtensionIndex = (
  fs: FileSystem.FileSystem,
  idxPath: string,
): Effect.Effect<ExtensionIndex, AppError> =>
  Effect.gen(function* () {
    const content = yield* fs.readFileString(idxPath).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "internal",
          detail: `Failed to read index: ${idxPath}`,
          cause: e,
        }),
      ),
    );
    return yield* decodeExtensionIndexFromJsonString(content).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "internal",
          detail: `Invalid index schema: ${idxPath}`,
          cause: e,
        }),
      ),
    );
  });

const indexToManifest = (
  index: ExtensionIndex,
  versionRange: Option.Option<string>,
): Option.Option<RegistryExtensionManifest> => {
  const selectedVersion = resolveVersionEntry(index.versions, versionRange);
  if (Option.isNone(selectedVersion)) return Option.none();

  const ver = selectedVersion.value;
  return Option.some({
    owner: index.owner,
    type: index.type,
    name: index.name,
    description: Option.fromUndefinedOr(index.description),
    repository: Option.fromUndefinedOr(index.repository),
    bugs: Option.fromUndefinedOr(index.bugs),
    license: Option.fromUndefinedOr(index.license),
    authors: Option.match(Option.fromUndefinedOr(index.authors), {
      onNone: (): ReadonlyArray<Author> => [],
      onSome: (authors) => authors.map((author) => toAuthor(author)),
    }),
    dependencies: ver.dependencies ?? {},
    version: ver.version,
    integrity: ver.integrity,
    companionPackages: companionPackagesToPackageUrlParts(ver.companionPackages),
  } satisfies RegistryExtensionManifest);
};

/**
 * Process a single name directory within a registry owner/type directory.
 * Reads the index.json, validates it, and selects a matching version.
 * Returns Some(RegistryExtensionManifest) if a matching version is found, None otherwise.
 */
const processNameDir = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  typeDir: string,
  nameDir: string,
  versionRange: Option.Option<string>,
): Effect.Effect<Option.Option<RegistryExtensionManifest>, AppError> =>
  Effect.gen(function* () {
    const dir = path.join(typeDir, nameDir);
    const idxPath = path.join(dir, "index.json");
    const idxExists = yield* fs.exists(idxPath).pipe(Effect.orElseSucceed(() => false));
    if (!idxExists) return Option.none();

    const index = yield* readExtensionIndex(fs, idxPath);
    return indexToManifest(index, versionRange);
  });

/** Convert an ExtensionIndex to a DiscoverExtensionEntry.
 *  Callers must ensure `index.versions` is non-empty (scanAllExtensions filters empty indices). */
const indexToDiscoverEntry = (index: ExtensionIndex): DiscoverExtensionEntry => {
  const [latestVersion] = index.versions;
  return {
    type: index.type,
    name: index.name,
    owner: index.owner,
    description: index.description ?? "",
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- caller filters empty versions
    latestVersion: latestVersion!.version,
  };
};

/** Parse a ExtensionSpec string into owner/type/name parts (ignoring version constraint). */
const parseRef = (ref: string): { owner: string; type: ExtensionType; name: string } | undefined =>
  parseExtensionSpecParts(ref);

/**
 * Scan all extensions under the extensions root directory.
 * Returns an array of ExtensionIndex entries.
 */
const scanAllExtensions = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  extensionsRoot: string,
): Effect.Effect<ReadonlyArray<ExtensionIndex>, AppError> =>
  Effect.gen(function* () {
    const ownerDirs = yield* fs
      .readDirectory(extensionsRoot)
      .pipe(Effect.orElseSucceed((): readonly string[] => []));

    // Cap concurrency at each nesting level to bound resource usage on large registries.
    const nestedResults = yield* Effect.forEach(
      ownerDirs.filter((d) => d.startsWith("@")),
      (ownerDir) =>
        Effect.gen(function* () {
          const ownerPath = path.join(extensionsRoot, ownerDir);
          const typeDirs = yield* fs
            .readDirectory(ownerPath)
            .pipe(Effect.orElseSucceed((): readonly string[] => []));

          const typeResults = yield* Effect.forEach(
            typeDirs.filter((d) => isExtensionTypePlural(d)),
            (typeDir) =>
              Effect.gen(function* () {
                const typePath = path.join(ownerPath, typeDir);
                const nameDirs = yield* fs
                  .readDirectory(typePath)
                  .pipe(Effect.orElseSucceed((): readonly string[] => []));

                return yield* Effect.forEach(
                  nameDirs,
                  (nameDir) =>
                    Effect.gen(function* () {
                      const idxPath = path.join(typePath, nameDir, "index.json");
                      const exists = yield* fs
                        .exists(idxPath)
                        .pipe(Effect.orElseSucceed(() => false));
                      if (!exists) return Option.none<ExtensionIndex>();

                      const index = yield* readExtensionIndex(fs, idxPath);
                      if (index.versions.length === 0) return Option.none<ExtensionIndex>();
                      return Option.some(index);
                    }),
                  { concurrency: 20 },
                ).pipe(Effect.map(Array.getSomes));
              }),
            { concurrency: 20 },
          );

          return Array.flatten(typeResults);
        }),
      { concurrency: 20 },
    );

    return Array.flatten(nestedResults);
  });

// -----------------------------------------------------------------------------
// Local Registry Client
// -----------------------------------------------------------------------------

/**
 * Creates a local filesystem-backed registry client.
 *
 * All operations read/write files relative to `registryRoot` using the
 * registry layout: `<root>/extensions/@<owner>/<type>/<name>/`.
 *
 * @param registryRoot - Absolute path to the registry root directory
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createLocalRegistryClient = (
  registryRoot: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): RegistryClient => ({
  getExtensionsByScope: (args) =>
    Effect.gen(function* () {
      if (args.owner === "*") {
        const extensionsDir = path.join(registryRoot, "extensions");
        const indexes = yield* scanAllExtensions(fs, path, extensionsDir);
        const manifests = Array.getSomes(
          indexes
            .filter((index) => args.types.length === 0 || args.types.includes(index.type))
            .filter((index) => args.names.length === 0 || args.names.includes(index.name))
            .map((index) => indexToManifest(index, Option.none())),
        );
        const total = manifests.length;
        const sliced = manifests.slice(args.offset);
        const extensions = Option.match(args.limit, {
          onNone: () => sliced,
          onSome: (l) => sliced.slice(0, l),
        });
        return {
          extensions,
          total,
        } satisfies GetExtensionsByOwnerResponse;
      }

      const findForName = (name: string) =>
        Effect.gen(function* () {
          const requestedTypes: ReadonlyArray<ExtensionType> =
            args.types.length === 0 ? ["skill", "mcp-server", "pack"] : args.types;

          const extensionsDir = path.join(registryRoot, "extensions");

          const nestedResults = yield* Effect.forEach(
            requestedTypes,
            (extType) =>
              Effect.gen(function* () {
                const typeDir = path.join(extensionsDir, args.owner, pluralizeType(extType));
                const typeDirExists = yield* fs
                  .exists(typeDir)
                  .pipe(Effect.orElseSucceed(() => false));
                if (!typeDirExists) return [];

                const nameDirs = yield* fs
                  .readDirectory(typeDir)
                  .pipe(Effect.orElseSucceed((): readonly string[] => []));
                const filtered = name !== "" ? nameDirs.filter((d) => d === name) : nameDirs;

                return yield* Effect.forEach(
                  filtered,
                  (nameDir) => processNameDir(fs, path, typeDir, nameDir, Option.none()),
                  { concurrency: "unbounded" },
                ).pipe(Effect.map(Array.getSomes));
              }),
            { concurrency: "unbounded" },
          );

          return Array.flatten(nestedResults);
        });

      const all: ReadonlyArray<RegistryExtensionManifest> =
        args.names.length > 0
          ? yield* Effect.forEach(args.names, (name) => findForName(name), {
              concurrency: "unbounded",
            }).pipe(Effect.map(Array.flatten))
          : yield* findForName("");

      const total = all.length;
      const offset = args.offset;
      const sliced = all.slice(offset);
      const extensions = Option.match(args.limit, {
        onNone: () => sliced,
        onSome: (l) => sliced.slice(0, l),
      });

      return {
        extensions,
        total,
      } satisfies GetExtensionsByOwnerResponse;
    }),

  ownerExists: (owner) =>
    Effect.gen(function* () {
      const scopeDir = path.join(registryRoot, "extensions", owner);
      const exists = yield* fs.exists(scopeDir).pipe(Effect.orElseSucceed(() => false));
      return { exists };
    }),

  getExtensionIndex: (args) =>
    Effect.gen(function* () {
      const dir = extensionDir(registryRoot, args.owner, args.type, args.name, path.join);
      const idxPath = path.join(dir, "index.json");
      const exists = yield* fs.exists(idxPath).pipe(Effect.orElseSucceed(() => false));
      if (!exists) {
        return Option.none<ExtensionIndex>();
      }

      return Option.some(yield* readExtensionIndex(fs, idxPath));
    }),

  getExtensionPackage: (args: GetExtensionPackageArgs) =>
    Effect.gen(function* () {
      const owner = args.owner;
      const dir = extensionDir(registryRoot, owner, args.type, args.name, path.join);

      const version = yield* Option.match(args.version, {
        onNone: () =>
          Effect.gen(function* () {
            const idxPath = path.join(dir, "index.json");
            const index = yield* readExtensionIndex(fs, idxPath);

            const selected = selectVersion(index.versions);
            if (Option.isNone(selected)) {
              return yield* makeAppError({
                code: "internal",
                detail: `No versions found for ${owner}/${args.type}/${args.name}`,
              });
            }
            return selected.value.version;
          }),
        onSome: (requestedVersion) =>
          Effect.gen(function* () {
            const requestedArchivePath = path.join(dir, `${requestedVersion}.zip`);
            const requestedExists = yield* fs
              .exists(requestedArchivePath)
              .pipe(Effect.orElseSucceed(() => false));

            // Fast path: exact version archive exists.
            if (requestedExists) {
              return requestedVersion;
            }

            // Fallback: treat requested version as semver constraint (e.g. ^1.0.0).
            const idxPath = path.join(dir, "index.json");
            const index = yield* readExtensionIndex(fs, idxPath);

            const selected = resolveVersionEntry(index.versions, Option.some(requestedVersion));
            if (Option.isNone(selected)) {
              return yield* makeAppError({
                code: "internal",
                detail: `No version matched constraint "${requestedVersion}" for ${owner}/${args.type}/${args.name}`,
              });
            }
            return selected.value.version;
          }),
      });

      const archivePath = path.join(dir, `${version}.zip`);

      const exists = yield* fs.exists(archivePath).pipe(Effect.orElseSucceed(() => false));
      if (!exists) {
        return yield* makeAppError({
          code: "internal",
          detail: `Archive not found: ${archivePath}`,
        });
      }

      const archive = yield* fs.readFile(archivePath).pipe(
        Effect.mapError((e) =>
          makeAppError({
            code: "internal",
            detail: `Failed to read archive: ${archivePath}`,
            cause: e,
          }),
        ),
      );
      return { archive };
    }),

  publishExtension: (args: PublishExtensionArgs) =>
    Effect.gen(function* () {
      const owner = args.owner;
      const dir = extensionDir(registryRoot, owner, args.type, args.name, path.join);

      // Ensure directory exists
      yield* fs.makeDirectory(dir, { recursive: true }).pipe(
        Effect.mapError((e) =>
          errRegistryPublishRejected({
            message: `Registry directory could not be created: ${dir}`,
            cause: e,
          }),
        ),
      );

      const indexPath = path.join(dir, "index.json");
      const archivePath = path.join(dir, `${args.version}.zip`);

      // Check for existing index
      const indexExists = yield* fs.exists(indexPath).pipe(Effect.orElseSucceed(() => false));

      if (indexExists) {
        // Read existing index
        const content = yield* fs.readFileString(indexPath).pipe(
          Effect.mapError((e) =>
            errRegistryPublishRejected({
              message: `Registry index could not be read: ${indexPath}`,
              cause: e,
            }),
          ),
        );
        const existingIndex = yield* decodeExtensionIndexFromJsonString(content).pipe(
          Effect.mapError((e) =>
            errRegistryPublishRejected({
              message: "Registry index schema is invalid",
              cause: e,
            }),
          ),
        );

        // Check idempotency: same version + same integrity = no-op
        const existingVersion = existingIndex.versions.find((v) => v.version === args.version);
        if (existingVersion) {
          if (existingVersion.integrity === args.metadata.integrity) {
            return { published: true } as const; // Idempotent: same version, same integrity -> no-op
          }
          return yield* errPublishConflict({ version: args.version });
        }

        // Prepend new version entry
        const updatedIndex: ExtensionIndex = {
          ...existingIndex,
          versions: [args.metadata, ...existingIndex.versions],
        };
        yield* fs
          .writeFileString(indexPath, `${encodeExtensionIndexToJsonString(updatedIndex)}\n`)
          .pipe(
            Effect.mapError((e) =>
              errRegistryPublishRejected({
                message: `Registry index could not be written: ${indexPath}`,
                cause: e,
              }),
            ),
          );
      } else {
        // Create new index
        const newIndex: ExtensionIndex = {
          name: args.name,
          owner,
          type: args.type,
          versions: [args.metadata],
        };
        yield* fs
          .writeFileString(indexPath, `${encodeExtensionIndexToJsonString(newIndex)}\n`)
          .pipe(
            Effect.mapError((e) =>
              errRegistryPublishRejected({
                message: `Registry index could not be written: ${indexPath}`,
                cause: e,
              }),
            ),
          );
      }

      // Write archive
      yield* fs.writeFile(archivePath, args.archive).pipe(
        Effect.mapError((e) =>
          errRegistryPublishRejected({
            message: `Registry archive could not be written: ${archivePath}`,
            cause: e,
          }),
        ),
      );

      return { published: true } as const;
    }),

  extensionExists: (args: ExtensionExistsArgs) =>
    Effect.gen(function* () {
      const owner = args.owner;
      const dir = extensionDir(registryRoot, owner, args.type, args.name, path.join);
      const indexPath = path.join(dir, "index.json");
      const exists = yield* fs.exists(indexPath).pipe(Effect.orElseSucceed(() => false));
      return { exists };
    }),

  discoverExtensions: (args: DiscoverExtensionsArgs) =>
    Effect.gen(function* () {
      const extensionsRoot = path.join(registryRoot, "extensions");
      const rootExists = yield* fs.exists(extensionsRoot).pipe(Effect.orElseSucceed(() => false));
      if (!rootExists) {
        return { results: [], resolvedRecommendations: [] } satisfies DiscoverExtensionsResponse;
      }

      // Scan all extensions and read their index.json
      const allExtensions = yield* scanAllExtensions(fs, path, extensionsRoot);

      // Match packages against extension companionPackages (from latest version)
      const results = args.packages.flatMap((detectedPurl) => {
        const matching = allExtensions.filter((ext) => {
          const latestVersion = ext.versions[0];
          if (latestVersion === undefined) return false;
          return companionPackagesToPackageUrlParts(latestVersion.companionPackages).some(
            (declared) => purlMatch(detectedPurl, declared),
          );
        });
        if (matching.length === 0) return [];
        return [
          {
            detectedPackage: detectedPurl,
            extensions: matching.map(indexToDiscoverEntry),
          },
        ];
      });

      // Resolve workspace recommendations
      const resolvedRecommendations = (args.workspaceRecommendedExtensions ?? []).flatMap((ref) => {
        const parsed = parseRef(ref);
        if (parsed === undefined) return [];
        const match = allExtensions.find(
          (ext) =>
            ext.owner === parsed.owner && ext.type === parsed.type && ext.name === parsed.name,
        );
        if (match === undefined) return [];
        return [indexToDiscoverEntry(match)];
      });

      return { results, resolvedRecommendations } satisfies DiscoverExtensionsResponse;
    }),
});
