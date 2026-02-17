/**
 * Registry source provider implementations.
 *
 * Provides `LocalRegistrySourceProvider` for filesystem-backed registries
 * and `RemoteRegistrySourceProvider` stub for future HTTPS registries.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { execSync } from "node:child_process";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { CliError } from "../../cli-error/index.js";
import type { RegistryExtensionType } from "../../registry/index.js";
import {
  ExtensionIndexSchema,
  type ExtensionIndex,
  type VersionEntry,
} from "../../registry/index.js";
import { makeCliError } from "../../cli-error/index.js";
import { computeChecksum } from "../../utils/checksum.js";
import type { FindOptions, PublishableSourceHostProvider } from "../provider.js";
import type {
  NewRegistrySource,
  RegistrySourceHost,
  RegistrySourceInput,
  SourceExtensionRef,
} from "../types.js";

// -----------------------------------------------------------------------------
// Registry Source Provider Interface
// -----------------------------------------------------------------------------

/**
 * Extended capabilities for registry source providers.
 *
 * Adds registry-specific operations (fetchIndex, fetchArchive, publishVersion,
 * checkNameExists) on top of the base provider interface.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface RegistrySourceProvider {
  readonly type: "registry";
  /** Discover extensions matching the given source and options. */
  readonly find: (
    source: RegistrySourceInput,
    options: FindOptions,
  ) => Effect.Effect<
    ReadonlyArray<SourceExtensionRef>,
    CliError,
    FileSystem.FileSystem | Path.Path
  >;
  /** Fetch and materialize extension files for a discovered ref. */
  readonly fetch: (
    source: RegistrySourceInput,
    extension: SourceExtensionRef,
  ) => Effect.Effect<{ readonly directory: string }, CliError, FileSystem.FileSystem | Path.Path>;
  /** Read the extension index from the registry. */
  readonly fetchIndex: (
    scope: string,
    type: RegistryExtensionType,
    name: string,
  ) => Effect.Effect<ExtensionIndex, CliError, FileSystem.FileSystem | Path.Path>;
  /** Read the archive bytes for a specific version. */
  readonly fetchArchive: (
    scope: string,
    type: RegistryExtensionType,
    name: string,
    version: string,
  ) => Effect.Effect<Uint8Array, CliError, FileSystem.FileSystem | Path.Path>;
  /** Publish a version to the registry. */
  readonly publishVersion: (
    scope: string,
    type: RegistryExtensionType,
    name: string,
    version: string,
    archive: Uint8Array,
    metadata: VersionEntry,
  ) => Effect.Effect<void, CliError, FileSystem.FileSystem | Path.Path>;
  /** Check if an extension name exists in the registry. */
  readonly checkNameExists: (
    scope: string,
    type: RegistryExtensionType,
    name: string,
  ) => Effect.Effect<boolean, CliError, FileSystem.FileSystem | Path.Path>;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Pluralize extension type for directory segments. */
const pluralizeType = (type: RegistryExtensionType): string => {
  switch (type) {
    case "skill":
      return "skills";
    case "pack":
      return "packs";
    case "mcp-server":
      return "mcp-servers";
  }
};

/** Build the path to an extension's directory within a registry. */
const extensionDir = (
  registryRoot: string,
  scope: string,
  type: RegistryExtensionType,
  name: string,
  join: (...parts: readonly string[]) => string,
): string => join(registryRoot, "extensions", scope, pluralizeType(type), name);

// -----------------------------------------------------------------------------
// Version Selection
// -----------------------------------------------------------------------------

/**
 * Select the best matching version from a list of versions.
 *
 * Iterates versions (newest first), checking agent compatibility.
 * Returns the first matching version.
 */
const selectVersion = (
  versions: ReadonlyArray<VersionEntry>,
  options: FindOptions,
): Option.Option<VersionEntry> => {
  for (const version of versions) {
    // Agent filter: if both options.agents and version.agents are non-empty,
    // require at least one intersection. Empty version.agents = universal (all agents).
    if (options.agents.length > 0 && version.agents.length > 0) {
      const agentSet = new Set(version.agents);
      const hasMatch = options.agents.some((a) => agentSet.has(a));
      if (!hasMatch) continue;
    }
    return Option.some(version);
  }
  return Option.none();
};

/**
 * Process a single name directory within a registry scope/type directory.
 * Reads the index.json, validates it, and selects a matching version.
 * Returns Some(SourceExtensionRef) if a matching version is found, None otherwise.
 */
const processNameDir = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  typeDir: string,
  nameDir: string,
  scopeDir: string,
  options: FindOptions,
): Effect.Effect<Option.Option<SourceExtensionRef>, CliError> =>
  Effect.gen(function* () {
    const dir = path.join(typeDir, nameDir);
    const idxPath = path.join(dir, "index.json");
    const idxExists = yield* fs.exists(idxPath).pipe(Effect.orElseSucceed(() => false));
    if (!idxExists) return Option.none();

    const content = yield* fs.readFileString(idxPath).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "SOURCE_FETCH_FAILED",
          what: `Failed to read index: ${idxPath}`,
          cause: e,
        }),
      ),
    );
    const json = yield* Effect.try({
      try: () => JSON.parse(content) as unknown,
      catch: (e) =>
        makeCliError({
          code: "SOURCE_FETCH_FAILED",
          what: `Invalid JSON in index: ${idxPath}`,
          cause: e,
        }),
    });
    const index = yield* Schema.decodeUnknown(ExtensionIndexSchema)(json).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "SOURCE_FETCH_FAILED",
          what: `Invalid index schema: ${idxPath}`,
          cause: e,
        }),
      ),
    );

    const selectedVersion = selectVersion(index.versions, options);
    if (Option.isNone(selectedVersion)) return Option.none();

    const ver = selectedVersion.value;

    // Assertion needed: TS can't prove the shape matches a specific SourceExtensionRef variant
    return Option.some({
      type: "skill" as const,
      skill: {
        name: nameDir,
        description: index.description ?? "",
        metadata: Option.none(),
      },
      source: {
        type: "registry" as const,
        scope: scopeDir,
        name: nameDir,
        versionConstraint: Option.none(),
      },
      version: ver.version,
      checksum: ver.checksum,
    } as SourceExtensionRef);
  });

// -----------------------------------------------------------------------------
// Local Registry Source Provider
// -----------------------------------------------------------------------------

/**
 * Creates a local filesystem-backed registry source provider.
 *
 * All operations read/write files relative to `registryRoot` using the
 * registry layout: `<root>/extensions/@<scope>/<type>/<name>/`.
 *
 * @param registryRoot - Absolute path to the registry root directory
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createLocalRegistryProvider = (registryRoot: string): RegistrySourceProvider => ({
  type: "registry",

  find: (_source, options) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const findForName = (name: string) =>
        Effect.gen(function* () {
          const typeFilter: ReadonlyArray<RegistryExtensionType> =
            options.type === "*"
              ? ["skill", "mcp-server", "pack"]
              : [options.type as RegistryExtensionType];

          const refs: SourceExtensionRef[] = [];

          // Sequential: each iteration reads from the filesystem and may early-return
          for (const extType of typeFilter) {
            const extensionsDir = path.join(registryRoot, "extensions");
            const extensionsDirExists = yield* fs
              .exists(extensionsDir)
              .pipe(Effect.orElseSucceed(() => false));
            if (!extensionsDirExists) return refs;

            const scopeDirs = yield* fs
              .readDirectory(extensionsDir)
              .pipe(Effect.orElseSucceed(() => [] as readonly string[]));

            for (const scopeDir of scopeDirs) {
              if (!scopeDir.startsWith("@")) continue;
              // Scope filtering: when source specifies a scope, skip non-matching dirs
              if (_source.scope && scopeDir !== _source.scope) continue;
              const typeDir = path.join(extensionsDir, scopeDir, pluralizeType(extType));
              const typeDirExists = yield* fs
                .exists(typeDir)
                .pipe(Effect.orElseSucceed(() => false));
              if (!typeDirExists) continue;

              const nameDirs = yield* fs
                .readDirectory(typeDir)
                .pipe(Effect.orElseSucceed(() => [] as readonly string[]));

              for (const nameDir of nameDirs) {
                if (name !== "" && nameDir !== name) continue;
                const ref = yield* processNameDir(fs, path, typeDir, nameDir, scopeDir, options);
                if (Option.isSome(ref)) refs.push(ref.value);
              }
            }
          }

          return refs;
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

  fetch: (_source, extension) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      if (extension.type !== "skill" || !("version" in extension)) {
        return yield* Effect.fail(
          makeCliError({
            code: "SOURCE_FETCH_FAILED",
            what: "Cannot fetch non-skill or versionless extension from registry",
          }),
        );
      }

      // Assertion needed: TS can't narrow "version" field after the "in" check
      const version = (extension as { version: string }).version;
      const dir = extensionDir(
        registryRoot,
        _source.scope,
        "skill",
        extension.skill.name,
        path.join,
      );
      const archivePath = path.join(dir, `${version}.zip`);

      const archiveExists = yield* fs.exists(archivePath).pipe(Effect.orElseSucceed(() => false));
      if (!archiveExists) {
        return yield* Effect.fail(
          makeCliError({
            code: "SOURCE_FETCH_FAILED",
            what: `Archive not found: ${archivePath}`,
          }),
        );
      }

      const archiveBytes = yield* fs.readFile(archivePath).pipe(
        Effect.mapError((e) =>
          makeCliError({
            code: "SOURCE_FETCH_FAILED",
            what: `Failed to read archive: ${archivePath}`,
            cause: e,
          }),
        ),
      );

      // Read index.json to get expected checksum
      const indexPath = path.join(dir, "index.json");
      const indexContent = yield* fs.readFileString(indexPath).pipe(
        Effect.mapError((e) =>
          makeCliError({
            code: "SOURCE_FETCH_FAILED",
            what: `Failed to read index: ${indexPath}`,
            cause: e,
          }),
        ),
      );
      const indexJson = yield* Effect.try({
        try: () => JSON.parse(indexContent) as unknown,
        catch: (e) =>
          makeCliError({ code: "SOURCE_FETCH_FAILED", what: `Invalid JSON in index`, cause: e }),
      });
      const index = yield* Schema.decodeUnknown(ExtensionIndexSchema)(indexJson).pipe(
        Effect.mapError((e) =>
          makeCliError({ code: "SOURCE_FETCH_FAILED", what: `Invalid index schema`, cause: e }),
        ),
      );

      const versionEntry = index.versions.find((v) => v.version === version);
      if (!versionEntry) {
        return yield* Effect.fail(
          makeCliError({
            code: "SOURCE_FETCH_FAILED",
            what: `Version ${version} not found in index`,
          }),
        );
      }

      // Verify checksum
      const actualChecksum = yield* computeChecksum(archiveBytes);
      if (actualChecksum !== versionEntry.checksum) {
        return yield* Effect.fail(
          makeCliError({
            code: "SOURCE_FETCH_FAILED",
            what: `Checksum mismatch for ${version}`,
            details: [`Expected ${versionEntry.checksum}, got ${actualChecksum}`],
          }),
        );
      }

      // Extract zip to temp directory
      const tmpDir = yield* fs.makeTempDirectory().pipe(
        Effect.mapError((e) =>
          makeCliError({
            code: "SOURCE_FETCH_FAILED",
            what: "Failed to create temp directory",
            cause: e,
          }),
        ),
      );

      yield* extractZip(archiveBytes, tmpDir);

      return { directory: tmpDir };
    }),

  fetchIndex: (scope, type, name) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const p = yield* Path.Path;
      const dir = extensionDir(registryRoot, scope, type, name, p.join);
      const indexPath = p.join(dir, "index.json");

      const exists = yield* fs.exists(indexPath).pipe(Effect.orElseSucceed(() => false));
      if (!exists) {
        return yield* Effect.fail(
          makeCliError({
            code: "REGISTRY_FETCH_FAILED",
            what: `Index not found: ${indexPath}`,
          }),
        );
      }

      const content = yield* fs.readFileString(indexPath).pipe(
        Effect.mapError((e) =>
          makeCliError({
            code: "REGISTRY_FETCH_FAILED",
            what: `Failed to read index: ${indexPath}`,
            cause: e,
          }),
        ),
      );
      const json = yield* Effect.try({
        try: () => JSON.parse(content) as unknown,
        catch: (e) =>
          makeCliError({
            code: "REGISTRY_FETCH_FAILED",
            what: `Invalid JSON in index: ${indexPath}`,
            cause: e,
          }),
      });

      return yield* Schema.decodeUnknown(ExtensionIndexSchema)(json).pipe(
        Effect.mapError((e) =>
          makeCliError({
            code: "REGISTRY_FETCH_FAILED",
            what: `Invalid index schema: ${indexPath}`,
            cause: e,
          }),
        ),
      );
    }),

  fetchArchive: (scope, type, name, version) =>
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

  publishVersion: (scope, type, name, version, archive, metadata) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const p = yield* Path.Path;
      const dir = extensionDir(registryRoot, scope, type, name, p.join);

      // Ensure directory exists
      yield* fs.makeDirectory(dir, { recursive: true }).pipe(
        Effect.mapError((e) =>
          makeCliError({
            code: "REGISTRY_FETCH_FAILED",
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
              code: "REGISTRY_FETCH_FAILED",
              what: `Failed to read index: ${indexPath}`,
              cause: e,
            }),
          ),
        );
        const json = yield* Effect.try({
          try: () => JSON.parse(content) as unknown,
          catch: (e) =>
            makeCliError({
              code: "REGISTRY_FETCH_FAILED",
              what: `Invalid JSON in index`,
              cause: e,
            }),
        });
        const existingIndex = yield* Schema.decodeUnknown(ExtensionIndexSchema)(json).pipe(
          Effect.mapError((e) =>
            makeCliError({ code: "REGISTRY_FETCH_FAILED", what: `Invalid index schema`, cause: e }),
          ),
        );

        // Check idempotency: same version + same checksum = no-op
        const existingVersion = existingIndex.versions.find((v) => v.version === version);
        if (existingVersion) {
          if (existingVersion.checksum === metadata.checksum) {
            return; // Idempotent: same version, same checksum → no-op
          }
          return yield* Effect.fail(
            makeCliError({
              code: "REGISTRY_FETCH_FAILED",
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
              code: "REGISTRY_FETCH_FAILED",
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
          type: type,
          versions: [metadata],
        };
        yield* fs.writeFileString(indexPath, JSON.stringify(newIndex, null, 2) + "\n").pipe(
          Effect.mapError((e) =>
            makeCliError({
              code: "REGISTRY_FETCH_FAILED",
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
            code: "REGISTRY_FETCH_FAILED",
            what: `Failed to write archive: ${archivePath}`,
            cause: e,
          }),
        ),
      );
    }),

  checkNameExists: (scope, type, name) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const p = yield* Path.Path;
      const dir = extensionDir(registryRoot, scope, type, name, p.join);
      const indexPath = p.join(dir, "index.json");
      return yield* fs.exists(indexPath).pipe(Effect.orElseSucceed(() => false));
    }),
});

// -----------------------------------------------------------------------------
// Zip Extraction
// -----------------------------------------------------------------------------

/**
 * Extract a zip archive to a target directory.
 * Uses the `unzip` CLI command for simplicity.
 *
 * TODO: Replace `unzip` CLI with a JS zip library for Windows portability.
 * Note: archivePath and targetDir are internally generated (not user-controlled),
 * so shell injection risk is mitigated.
 */
const extractZip = (archive: Uint8Array, targetDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    // Write archive to a temp file
    const archivePath = path.join(targetDir, "__archive__.zip");
    yield* fs.writeFile(archivePath, archive).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "SOURCE_FETCH_FAILED",
          what: `Failed to write temp archive`,
          cause: e,
        }),
      ),
    );

    // Extract using unzip command
    yield* Effect.try({
      try: () =>
        execSync(`unzip -o -q "${archivePath}" -d "${targetDir}"`, {
          stdio: "pipe",
        }),
      catch: (e) =>
        makeCliError({ code: "SOURCE_FETCH_FAILED", what: `Failed to extract archive`, cause: e }),
    });

    // Clean up temp archive file
    yield* fs.remove(archivePath).pipe(Effect.ignoreLogged);
  });

// -----------------------------------------------------------------------------
// Remote Registry Source Provider (Stub)
// -----------------------------------------------------------------------------

/**
 * Creates a remote HTTPS registry source provider stub.
 *
 * All operations fail with "remote registry not yet supported" error.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createRemoteRegistryProvider = (): RegistrySourceProvider => ({
  type: "registry",

  find: () =>
    Effect.fail(
      makeCliError({
        code: "SOURCE_FETCH_FAILED",
        what: "Remote registry sources are not yet supported",
      }),
    ),

  fetch: () =>
    Effect.fail(
      makeCliError({
        code: "SOURCE_FETCH_FAILED",
        what: "Remote registry sources are not yet supported",
      }),
    ),

  fetchIndex: () =>
    Effect.fail(
      makeCliError({
        code: "REGISTRY_FETCH_FAILED",
        what: "Remote registry sources are not yet supported",
      }),
    ),

  fetchArchive: () =>
    Effect.fail(
      makeCliError({
        code: "REGISTRY_FETCH_FAILED",
        what: "Remote registry sources are not yet supported",
      }),
    ),

  publishVersion: () =>
    Effect.fail(
      makeCliError({
        code: "REGISTRY_FETCH_FAILED",
        what: "Remote registry sources are not yet supported",
      }),
    ),

  checkNameExists: () =>
    Effect.fail(
      makeCliError({
        code: "REGISTRY_FETCH_FAILED",
        what: "Remote registry sources are not yet supported",
      }),
    ),
});

// -----------------------------------------------------------------------------
// Factory
// -----------------------------------------------------------------------------

/**
 * Create the appropriate registry provider based on location scheme.
 *
 * - Local paths and `file://` URLs → `LocalRegistrySourceProvider`
 * - `https://` URLs → `RemoteRegistrySourceProvider` (stub)
 *
 * @param location - Registry location (local path, file:// URL, or https:// URL)
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createRegistryProvider = (location: string): RegistrySourceProvider => {
  if (location.startsWith("https://")) {
    return createRemoteRegistryProvider();
  }

  // Strip file:// scheme if present
  const localPath = location.startsWith("file://") ? location.slice(7) : location;
  return createLocalRegistryProvider(localPath);
};

// -----------------------------------------------------------------------------
// New SourceHostProvider-based Registry Provider
// -----------------------------------------------------------------------------

/**
 * Creates a `PublishableSourceHostProvider` for a registry source.
 *
 * Constructed with a `RegistrySourceHost` that provides the registry URL and scopes.
 * The `match` method checks if a URL's hostname matches the configured registry.
 * The `find` implementation reads the registry index and populates checksum from index.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createRegistrySourceHostProvider = (
  host: RegistrySourceHost,
): PublishableSourceHostProvider<NewRegistrySource, FileSystem.FileSystem | Path.Path> => {
  const registryUrl = host.url;
  const isLocal = registryUrl.protocol === "file:" || !registryUrl.protocol.startsWith("http");
  const registryRoot = registryUrl.protocol === "file:" ? registryUrl.pathname : registryUrl.href;
  // For local registries, delegate to the existing local provider
  const inner = isLocal
    ? createLocalRegistryProvider(registryRoot)
    : createRemoteRegistryProvider();

  return {
    type: "registry",

    match: (url: URL) => Effect.succeed(url.hostname === registryUrl.hostname),

    find: (source, options) =>
      Effect.gen(function* () {
        const innerSource: RegistrySourceInput = {
          type: "registry",
          scope: source.scope,
          name: source.name,
          versionConstraint: source.versionConstraint,
        };
        const refs = yield* inner.find(innerSource, options);

        // Re-stamp source to the NewRegistrySource (includes host config)
        return refs.map((ref) => ({ ...ref, source }) as SourceExtensionRef);
      }),

    fetch: (source, ref) => {
      const innerSource: RegistrySourceInput = {
        type: "registry",
        scope: source.scope,
        name: source.name,
        versionConstraint: source.versionConstraint,
      };
      return inner.fetch(innerSource, ref);
    },

    publishVersion: (scope, type, name, version, archive, metadata) =>
      inner.publishVersion(scope, type, name, version, archive, metadata),
  };
};
