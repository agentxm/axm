/**
 * Local filesystem-backed registry client.
 *
 * All operations read/write files relative to a registry root using the
 * layout: `<root>/extensions/@<profile>/<type>/<name>/`.
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

import { makeAppError, type AppError } from "../app-error/index.js";
import type {
  RegistryClient,
  RegistryExtensionManifest,
  GetExtensionPackageArgs,
  PublishExtensionArgs,
  ExtensionExistsArgs,
  GetExtensionsByProfileResponse,
} from "./client.js";
import { toAuthor, type Author, type ExtensionType } from "../extensions/index.js";
import { ExtensionIndexSchema, type ExtensionIndex } from "./schema.js";
import { extensionDir, pluralizeType, resolveVersionEntry, selectVersion } from "./utils.js";

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
          code: "REGISTRY_FETCH_FAILED",
          what: `Failed to read index: ${idxPath}`,
          cause: e,
        }),
      ),
    );
    const json = yield* Effect.try({
      try: () => {
        const parsed: unknown = JSON.parse(content);
        return parsed;
      },
      catch: (e) =>
        makeAppError({
          code: "REGISTRY_FETCH_FAILED",
          what: `Invalid JSON in index: ${idxPath}`,
          cause: e,
        }),
    });

    return yield* Schema.decodeUnknownEffect(ExtensionIndexSchema)(json).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "REGISTRY_FETCH_FAILED",
          what: `Invalid index schema: ${idxPath}`,
          cause: e,
        }),
      ),
    );
  });

const indexToManifest = (
  index: ExtensionIndex,
  versionConstraint: Option.Option<string>,
): Option.Option<RegistryExtensionManifest> => {
  const selectedVersion = resolveVersionEntry(index.versions, versionConstraint);
  if (Option.isNone(selectedVersion)) return Option.none();

  const ver = selectedVersion.value;
  return Option.some({
    profile: index.profile,
    type: index.type,
    name: index.name,
    description: Option.fromUndefinedOr(index.description),
    repository: Option.fromUndefinedOr(index.repository),
    license: Option.fromUndefinedOr(index.license),
    authors: Option.match(Option.fromUndefinedOr(index.authors), {
      onNone: (): ReadonlyArray<Author> => [],
      onSome: (authors) => authors.map((author) => toAuthor(author)),
    }),
    dependencies: ver.dependencies ?? {},
    version: ver.version,
    integrity: ver.integrity,
  } satisfies RegistryExtensionManifest);
};

/**
 * Process a single name directory within a registry profile/type directory.
 * Reads the index.json, validates it, and selects a matching version.
 * Returns Some(RegistryExtensionManifest) if a matching version is found, None otherwise.
 */
const processNameDir = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  typeDir: string,
  nameDir: string,
  versionConstraint: Option.Option<string>,
): Effect.Effect<Option.Option<RegistryExtensionManifest>, AppError> =>
  Effect.gen(function* () {
    const dir = path.join(typeDir, nameDir);
    const idxPath = path.join(dir, "index.json");
    const idxExists = yield* fs.exists(idxPath).pipe(Effect.orElseSucceed(() => false));
    if (!idxExists) return Option.none();

    const index = yield* readExtensionIndex(fs, idxPath);
    return indexToManifest(index, versionConstraint);
  });

// -----------------------------------------------------------------------------
// Local Registry Client
// -----------------------------------------------------------------------------

/**
 * Creates a local filesystem-backed registry client.
 *
 * All operations read/write files relative to `registryRoot` using the
 * registry layout: `<root>/extensions/@<profile>/<type>/<name>/`.
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
      const findForName = (name: string) =>
        Effect.gen(function* () {
          const requestedTypes: ReadonlyArray<ExtensionType> =
            args.types.length === 0 ? ["skill", "mcp-server", "pack"] : args.types;

          const extensionsDir = path.join(registryRoot, "extensions");

          const nestedResults = yield* Effect.forEach(
            requestedTypes,
            (extType) =>
              Effect.gen(function* () {
                const typeDir = path.join(extensionsDir, args.handle, pluralizeType(extType));
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
      } satisfies GetExtensionsByProfileResponse;
    }),

  profileExists: (handle) =>
    Effect.gen(function* () {
      const scopeDir = path.join(registryRoot, "extensions", handle);
      const exists = yield* fs.exists(scopeDir).pipe(Effect.orElseSucceed(() => false));
      return { exists };
    }),

  getExtensionIndex: (args) =>
    Effect.gen(function* () {
      const dir = extensionDir(registryRoot, args.handle, args.type, args.name, path.join);
      const idxPath = path.join(dir, "index.json");
      const exists = yield* fs.exists(idxPath).pipe(Effect.orElseSucceed(() => false));
      if (!exists) {
        return Option.none<ExtensionIndex>();
      }

      return Option.some(yield* readExtensionIndex(fs, idxPath));
    }),

  getExtensionPackage: (args: GetExtensionPackageArgs) =>
    Effect.gen(function* () {
      const profile = args.handle;
      const dir = extensionDir(registryRoot, profile, args.type, args.name, path.join);

      const version = yield* Option.match(args.version, {
        onNone: () =>
          Effect.gen(function* () {
            const idxPath = path.join(dir, "index.json");
            const index = yield* readExtensionIndex(fs, idxPath);

            const selected = selectVersion(index.versions);
            if (Option.isNone(selected)) {
              return yield* Effect.fail(
                makeAppError({
                  code: "REGISTRY_FETCH_FAILED",
                  what: `No versions found for ${profile}/${args.type}/${args.name}`,
                }),
              );
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
              return yield* Effect.fail(
                makeAppError({
                  code: "REGISTRY_FETCH_FAILED",
                  what: `No version matched constraint "${requestedVersion}" for ${profile}/${args.type}/${args.name}`,
                }),
              );
            }
            return selected.value.version;
          }),
      });

      const archivePath = path.join(dir, `${version}.zip`);

      const exists = yield* fs.exists(archivePath).pipe(Effect.orElseSucceed(() => false));
      if (!exists) {
        return yield* Effect.fail(
          makeAppError({
            code: "REGISTRY_FETCH_FAILED",
            what: `Archive not found: ${archivePath}`,
          }),
        );
      }

      const archive = yield* fs.readFile(archivePath).pipe(
        Effect.mapError((e) =>
          makeAppError({
            code: "REGISTRY_FETCH_FAILED",
            what: `Failed to read archive: ${archivePath}`,
            cause: e,
          }),
        ),
      );
      return { archive };
    }),

  publishExtension: (args: PublishExtensionArgs) =>
    Effect.gen(function* () {
      const profile = args.handle;
      const dir = extensionDir(registryRoot, profile, args.type, args.name, path.join);

      // Ensure directory exists
      yield* fs.makeDirectory(dir, { recursive: true }).pipe(
        Effect.mapError((e) =>
          makeAppError({
            code: "REGISTRY_PUBLISH_FAILED",
            what: `Failed to create directory: ${dir}`,
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
            makeAppError({
              code: "REGISTRY_PUBLISH_FAILED",
              what: `Failed to read index: ${indexPath}`,
              cause: e,
            }),
          ),
        );
        const json = yield* Effect.try({
          try: () => {
            const parsed: unknown = JSON.parse(content);
            return parsed;
          },
          catch: (e) =>
            makeAppError({
              code: "REGISTRY_PUBLISH_FAILED",
              what: `Invalid JSON in index`,
              cause: e,
            }),
        });
        const existingIndex = yield* Schema.decodeUnknownEffect(ExtensionIndexSchema)(json).pipe(
          Effect.mapError((e) =>
            makeAppError({
              code: "REGISTRY_PUBLISH_FAILED",
              what: `Invalid index schema`,
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
          return yield* Effect.fail(
            makeAppError({
              code: "REGISTRY_PUBLISH_FAILED",
              what: `Version ${args.version} already exists with different integrity`,
              details: [`Expected ${existingVersion.integrity}, got ${args.metadata.integrity}`],
            }),
          );
        }

        // Prepend new version entry
        const updatedIndex: ExtensionIndex = {
          ...existingIndex,
          versions: [args.metadata, ...existingIndex.versions],
        };
        yield* fs.writeFileString(indexPath, JSON.stringify(updatedIndex, null, 2) + "\n").pipe(
          Effect.mapError((e) =>
            makeAppError({
              code: "REGISTRY_PUBLISH_FAILED",
              what: `Failed to write index: ${indexPath}`,
              cause: e,
            }),
          ),
        );
      } else {
        // Create new index
        const newIndex: ExtensionIndex = {
          name: args.name,
          profile,
          type: args.type,
          versions: [args.metadata],
        };
        yield* fs.writeFileString(indexPath, JSON.stringify(newIndex, null, 2) + "\n").pipe(
          Effect.mapError((e) =>
            makeAppError({
              code: "REGISTRY_PUBLISH_FAILED",
              what: `Failed to write index: ${indexPath}`,
              cause: e,
            }),
          ),
        );
      }

      // Write archive
      yield* fs.writeFile(archivePath, args.archive).pipe(
        Effect.mapError((e) =>
          makeAppError({
            code: "REGISTRY_PUBLISH_FAILED",
            what: `Failed to write archive: ${archivePath}`,
            cause: e,
          }),
        ),
      );

      return { published: true } as const;
    }),

  extensionExists: (args: ExtensionExistsArgs) =>
    Effect.gen(function* () {
      const profile = args.handle;
      const dir = extensionDir(registryRoot, profile, args.type, args.name, path.join);
      const indexPath = path.join(dir, "index.json");
      const exists = yield* fs.exists(indexPath).pipe(Effect.orElseSucceed(() => false));
      return { exists };
    }),
});
