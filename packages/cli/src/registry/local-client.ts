/**
 * Local filesystem-backed registry client.
 *
 * All operations read/write files relative to a registry root using the
 * layout: `<root>/extensions/@<scope>/<type>/<name>/`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as FileSystem from "@effect/platform/FileSystem";
import type * as Path from "@effect/platform/Path";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { makeCliError, type CliError } from "../cli-error/index.js";
import type {
  RegistryClient,
  RegistryExtensionEntry,
  GetExtensionVersionArgs,
  PublishExtensionArgs,
  ExtensionExistsArgs,
  GetExtensionsResult,
} from "./client.js";
import type { ExtensionType } from "../extensions/common.js";
import { ExtensionIndexSchema, type ExtensionIndex } from "./local-schema.js";
import { extensionDir, pluralizeType, selectVersion } from "./utils.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Process a single name directory within a registry scope/type directory.
 * Reads the index.json, validates it, and selects a matching version.
 * Returns Some(RegistryExtensionEntry) if a matching version is found, None otherwise.
 */
const processNameDir = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  typeDir: string,
  nameDir: string,
  scopeDir: string,
): Effect.Effect<Option.Option<RegistryExtensionEntry>, CliError> =>
  Effect.gen(function* () {
    const dir = path.join(typeDir, nameDir);
    const idxPath = path.join(dir, "index.json");
    const idxExists = yield* fs.exists(idxPath).pipe(Effect.orElseSucceed(() => false));
    if (!idxExists) return Option.none();

    const content = yield* fs.readFileString(idxPath).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "REGISTRY_FETCH_FAILED",
          what: `Failed to read index: ${idxPath}`,
          cause: e,
        }),
      ),
    );
    const json = yield* Effect.try({
      try: () => JSON.parse(content) as unknown,
      catch: (e) =>
        makeCliError({
          code: "REGISTRY_FETCH_FAILED",
          what: `Invalid JSON in index: ${idxPath}`,
          cause: e,
        }),
    });
    const index = yield* Schema.decodeUnknown(ExtensionIndexSchema)(json).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "REGISTRY_FETCH_FAILED",
          what: `Invalid index schema: ${idxPath}`,
          cause: e,
        }),
      ),
    );

    const selectedVersion = selectVersion(index.versions);
    if (Option.isNone(selectedVersion)) return Option.none();

    const ver = selectedVersion.value;
    return Option.some({
      scope: scopeDir,
      type: index.type,
      name: nameDir,
      version: ver.version,
      checksum: ver.checksum,
    } satisfies RegistryExtensionEntry);
  });

// -----------------------------------------------------------------------------
// Local Registry Client
// -----------------------------------------------------------------------------

/**
 * Creates a local filesystem-backed registry client.
 *
 * All operations read/write files relative to `registryRoot` using the
 * registry layout: `<root>/extensions/@<scope>/<type>/<name>/`.
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
  getExtensions: (options) =>
    Effect.gen(function* () {
      const findForName = (name: string) =>
        Effect.gen(function* () {
          const requestedTypes: ReadonlyArray<ExtensionType> =
            options.type === "*" ? ["skill", "mcp-server", "pack"] : [options.type];

          const extensionsDir = path.join(registryRoot, "extensions");
          const extensionsDirExists = yield* fs
            .exists(extensionsDir)
            .pipe(Effect.orElseSucceed(() => false));
          if (!extensionsDirExists) return [] as ReadonlyArray<RegistryExtensionEntry>;

          const scopeDirs = yield* fs
            .readDirectory(extensionsDir)
            .pipe(Effect.orElseSucceed(() => [] as readonly string[]));
          const scopes = scopeDirs.filter((d) => d.startsWith("@"));

          const nestedResults = yield* Effect.forEach(
            requestedTypes,
            (extType) =>
              Effect.forEach(
                scopes,
                (scopeDir) =>
                  Effect.gen(function* () {
                    const typeDir = path.join(extensionsDir, scopeDir, pluralizeType(extType));
                    const typeDirExists = yield* fs
                      .exists(typeDir)
                      .pipe(Effect.orElseSucceed(() => false));
                    if (!typeDirExists) return [] as ReadonlyArray<RegistryExtensionEntry>;

                    const nameDirs = yield* fs
                      .readDirectory(typeDir)
                      .pipe(Effect.orElseSucceed(() => [] as readonly string[]));
                    const filtered = name !== "" ? nameDirs.filter((d) => d === name) : nameDirs;

                    return yield* Effect.forEach(
                      filtered,
                      (nameDir) => processNameDir(fs, path, typeDir, nameDir, scopeDir),
                      { concurrency: "unbounded" },
                    ).pipe(Effect.map(Array.getSomes));
                  }),
                { concurrency: "unbounded" },
              ).pipe(Effect.map(Array.flatten)),
            { concurrency: "unbounded" },
          );

          return Array.flatten(nestedResults);
        });

      const all: ReadonlyArray<RegistryExtensionEntry> =
        options.names.length > 0
          ? yield* Effect.forEach(options.names, (name) => findForName(name), {
              concurrency: "unbounded",
            }).pipe(Effect.map(Array.flatten))
          : yield* findForName("");

      const total = all.length;
      const offset = options.offset;
      const sliced = all.slice(offset);
      const extensions = Option.match(options.limit, {
        onNone: () => sliced,
        onSome: (l) => sliced.slice(0, l),
      });
      const limit = Option.getOrElse(options.limit, () => total);

      return {
        extensions,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + extensions.length < total,
        },
      } satisfies GetExtensionsResult;
    }),

  scopeExists: (scope) =>
    Effect.gen(function* () {
      const scopeDir = path.join(registryRoot, "extensions", scope);
      return yield* fs.exists(scopeDir).pipe(Effect.orElseSucceed(() => false));
    }),

  getExtensionVersion: (args: GetExtensionVersionArgs) =>
    Effect.gen(function* () {
      const dir = extensionDir(registryRoot, args.scope, args.type, args.name, path.join);

      const version = yield* Option.match(args.version, {
        onNone: () =>
          Effect.gen(function* () {
            const idxPath = path.join(dir, "index.json");
            const content = yield* fs.readFileString(idxPath).pipe(
              Effect.mapError((e) =>
                makeCliError({
                  code: "REGISTRY_FETCH_FAILED",
                  what: `Failed to read index: ${idxPath}`,
                  cause: e,
                }),
              ),
            );
            const json = yield* Effect.try({
              try: () => JSON.parse(content) as unknown,
              catch: (e) =>
                makeCliError({
                  code: "REGISTRY_FETCH_FAILED",
                  what: `Invalid JSON in index: ${idxPath}`,
                  cause: e,
                }),
            });
            const index = yield* Schema.decodeUnknown(ExtensionIndexSchema)(json).pipe(
              Effect.mapError((e) =>
                makeCliError({
                  code: "REGISTRY_FETCH_FAILED",
                  what: `Invalid index schema: ${idxPath}`,
                  cause: e,
                }),
              ),
            );

            const selected = selectVersion(index.versions);
            if (Option.isNone(selected)) {
              return yield* Effect.fail(
                makeCliError({
                  code: "REGISTRY_FETCH_FAILED",
                  what: `No versions found for ${args.scope}/${args.type}/${args.name}`,
                }),
              );
            }
            return selected.value.version;
          }),
        onSome: (v) => Effect.succeed(v),
      });

      const archivePath = path.join(dir, `${version}.zip`);

      const exists = yield* fs.exists(archivePath).pipe(Effect.orElseSucceed(() => false));
      if (!exists) {
        return yield* Effect.fail(
          makeCliError({
            code: "REGISTRY_FETCH_FAILED",
            what: `Archive not found: ${archivePath}`,
          }),
        );
      }

      return yield* fs.readFile(archivePath).pipe(
        Effect.mapError((e) =>
          makeCliError({
            code: "REGISTRY_FETCH_FAILED",
            what: `Failed to read archive: ${archivePath}`,
            cause: e,
          }),
        ),
      );
    }),

  publishExtension: (args: PublishExtensionArgs) =>
    Effect.gen(function* () {
      const dir = extensionDir(registryRoot, args.scope, args.type, args.name, path.join);

      // Ensure directory exists
      yield* fs.makeDirectory(dir, { recursive: true }).pipe(
        Effect.mapError((e) =>
          makeCliError({
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
            makeCliError({
              code: "REGISTRY_PUBLISH_FAILED",
              what: `Failed to read index: ${indexPath}`,
              cause: e,
            }),
          ),
        );
        const json = yield* Effect.try({
          try: () => JSON.parse(content) as unknown,
          catch: (e) =>
            makeCliError({
              code: "REGISTRY_PUBLISH_FAILED",
              what: `Invalid JSON in index`,
              cause: e,
            }),
        });
        const existingIndex = yield* Schema.decodeUnknown(ExtensionIndexSchema)(json).pipe(
          Effect.mapError((e) =>
            makeCliError({
              code: "REGISTRY_PUBLISH_FAILED",
              what: `Invalid index schema`,
              cause: e,
            }),
          ),
        );

        // Check idempotency: same version + same checksum = no-op
        const existingVersion = existingIndex.versions.find((v) => v.version === args.version);
        if (existingVersion) {
          if (existingVersion.checksum === args.metadata.checksum) {
            return; // Idempotent: same version, same checksum -> no-op
          }
          return yield* Effect.fail(
            makeCliError({
              code: "REGISTRY_PUBLISH_FAILED",
              what: `Version ${args.version} already exists with different checksum`,
              details: [`Expected ${existingVersion.checksum}, got ${args.metadata.checksum}`],
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
            makeCliError({
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
          scope: args.scope,
          type: args.type,
          versions: [args.metadata],
        };
        yield* fs.writeFileString(indexPath, JSON.stringify(newIndex, null, 2) + "\n").pipe(
          Effect.mapError((e) =>
            makeCliError({
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
          makeCliError({
            code: "REGISTRY_PUBLISH_FAILED",
            what: `Failed to write archive: ${archivePath}`,
            cause: e,
          }),
        ),
      );
    }),

  extensionExists: (args: ExtensionExistsArgs) =>
    Effect.gen(function* () {
      const dir = extensionDir(registryRoot, args.scope, args.type, args.name, path.join);
      const indexPath = path.join(dir, "index.json");
      return yield* fs.exists(indexPath).pipe(Effect.orElseSucceed(() => false));
    }),
});
