/**
 * Local filesystem-backed registry client.
 *
 * All operations read/write files relative to a registry root using the
 * layout: `<root>/extensions/@<scope>/<type>/<name>/`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { makeCliError, type CliError } from "../cli-error/index.js";
import type { RegistryClient, RegistryExtensionEntry, GetExtensionsArgs } from "./client.js";
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
  options: GetExtensionsArgs,
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

    const selectedVersion = selectVersion(index.versions, { agents: options.agents });
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
export const createLocalRegistryClient = (registryRoot: string): RegistryClient => ({
  getExtensions: (options) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

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
                      (nameDir) => processNameDir(fs, path, typeDir, nameDir, scopeDir, options),
                      { concurrency: "unbounded" },
                    ).pipe(Effect.map(Array.getSomes));
                  }),
                { concurrency: "unbounded" },
              ).pipe(Effect.map(Array.flatten)),
            { concurrency: "unbounded" },
          );

          return Array.flatten(nestedResults);
        });

      if (options.names.length > 0) {
        const results = yield* Effect.forEach(options.names, (name) => findForName(name), {
          concurrency: "unbounded",
        });
        return Array.flatten(results);
      }

      // Empty names = find all
      return yield* findForName("");
    }),

  scopeExists: (scope) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const p = yield* Path.Path;
      const scopeDir = p.join(registryRoot, "extensions", scope);
      return yield* fs.exists(scopeDir).pipe(Effect.orElseSucceed(() => false));
    }),

  getExtension: (scope, type, name, version) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const p = yield* Path.Path;
      const dir = extensionDir(registryRoot, scope, type, name, p.join);
      const archivePath = p.join(dir, `${version}.zip`);

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

  publishExtension: (scope, type, name, version, archive, metadata) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const p = yield* Path.Path;
      const dir = extensionDir(registryRoot, scope, type, name, p.join);

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

      const indexPath = p.join(dir, "index.json");
      const archivePath = p.join(dir, `${version}.zip`);

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
        const existingVersion = existingIndex.versions.find((v) => v.version === version);
        if (existingVersion) {
          if (existingVersion.checksum === metadata.checksum) {
            return; // Idempotent: same version, same checksum -> no-op
          }
          return yield* Effect.fail(
            makeCliError({
              code: "REGISTRY_PUBLISH_FAILED",
              what: `Version ${version} already exists with different checksum`,
              details: [`Expected ${existingVersion.checksum}, got ${metadata.checksum}`],
            }),
          );
        }

        // Prepend new version entry
        const updatedIndex: ExtensionIndex = {
          ...existingIndex,
          versions: [metadata, ...existingIndex.versions],
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
          name,
          scope,
          type,
          versions: [metadata],
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
      yield* fs.writeFile(archivePath, archive).pipe(
        Effect.mapError((e) =>
          makeCliError({
            code: "REGISTRY_PUBLISH_FAILED",
            what: `Failed to write archive: ${archivePath}`,
            cause: e,
          }),
        ),
      );
    }),

  extensionExists: (scope, type, name) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const p = yield* Path.Path;
      const dir = extensionDir(registryRoot, scope, type, name, p.join);
      const indexPath = p.join(dir, "index.json");
      return yield* fs.exists(indexPath).pipe(Effect.orElseSucceed(() => false));
    }),
});
