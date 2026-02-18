/**
 * Registry source host provider implementations.
 *
 * Thin adapters between SourceHostProvider contract and RegistryClient.
 * Type mapping at the boundary keeps registry and source domains separated.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { CliError } from "../../../cli-error/index.js";
import { makeCliError } from "../../../cli-error/index.js";
import type {
  RegistryClient,
  RegistryExtensionManifest,
  GetExtensionsByScopeArgs,
} from "../../../registry/index.js";
import { createRegistryClient, extractZip } from "../../../registry/index.js";
import { computeIntegrity } from "../../../utils/integrity.js";
import type { ExtensionType } from "../../../extensions/common.js";
import type { Author } from "../../../extensions/common.js";
import type { ExtensionFiles, FindOptions, SourceHostProvider } from "../../provider.js";
import type { RegistrySource, RegistrySourceHost, ExtensionRef } from "../../types.js";
import type { VersionEntry } from "../../../registry/index.js";

type RegistrySourceHostProviderWithPublish<R = never> = SourceHostProvider<RegistrySource, R> & {
  readonly publishExtension: (
    scope: string,
    type: ExtensionType,
    name: string,
    version: string,
    archive: Uint8Array,
    metadata: VersionEntry,
  ) => Effect.Effect<void, CliError, R>;
};

// -----------------------------------------------------------------------------
// Type Mapping Helpers
// -----------------------------------------------------------------------------

/** Map FindOptions + scope to GetExtensionsByScopeArgs (no pagination — fetch all). */
const toSearchOptions = (scope: string, options: FindOptions): GetExtensionsByScopeArgs => ({
  scope,
  names: options.skillNames,
  types: options.type === "*" ? [] : [options.type as ExtensionType],
  limit: Option.none(),
  offset: 0,
});

const authorToMetadata = (author: Author): Record<string, string> => ({
  name: author.name,
  ...(Option.isSome(author.email) && { email: author.email.value }),
  ...(Option.isSome(author.url) && { url: author.url.value }),
});

/** Map RegistryExtensionManifest to ExtensionRef, stamped with the source. */
const toExtensionRef = (entry: RegistryExtensionManifest, source: RegistrySource): ExtensionRef => {
  const repository = Option.getOrUndefined(entry.repository);
  const license = Option.getOrUndefined(entry.license);
  const authors = entry.authors.map((author) => authorToMetadata(author));
  const dependencies = entry.dependencies;
  const skillMetadata = {
    ...(repository !== undefined && { repository }),
    ...(license !== undefined && { license }),
    ...(authors.length > 0 && { authors }),
    ...(Object.keys(dependencies).length > 0 && { dependencies }),
  };

  const details = {
    scope: entry.scope,
    name: entry.name,
    version: entry.version,
    integrity: entry.integrity,
  };

  switch (entry.type) {
    case "skill":
      return {
        type: "skill",
        refType: "registry" as const,
        skill: {
          name: entry.name,
          description: entry.description,
          metadata:
            Object.keys(skillMetadata).length > 0 ? Option.some(skillMetadata) : Option.none(),
        },
        source,
        ...details,
      };
    case "mcp-server":
      return {
        type: "mcp-server",
        refType: "registry" as const,
        server: { name: entry.name },
        source,
        ...details,
      };
    case "pack":
      return {
        type: "pack",
        refType: "registry" as const,
        pack: { name: entry.name },
        source,
        ...details,
      };
  }
};

/** Extract extension name from an ExtensionRef. */
const refName = (ref: ExtensionRef): string => {
  switch (ref.type) {
    case "skill":
      return ref.skill.name;
    case "mcp-server":
      return ref.server.name;
    case "pack":
      return ref.pack.name;
  }
};

/** Map ExtensionRef type to ExtensionType. */
const refRegistryType = (ref: ExtensionRef): ExtensionType => ref.type;

const fetchRegistryExtension = (client: RegistryClient, ref: ExtensionRef) =>
  Effect.gen(function* () {
    if (ref.refType !== "registry") {
      return yield* makeCliError({
        code: "SOURCE_FETCH_FAILED",
        what: "Ref missing registry details (scope, version, integrity)",
      });
    }

    const { scope, version, integrity: expectedIntegrity } = ref;
    const type = refRegistryType(ref);
    const name = refName(ref);

    const { archive: archiveBytes } = yield* client.getExtensionPackage({
      scope,
      type,
      name,
      version: Option.some(version),
    });

    const actualIntegrity = yield* computeIntegrity(archiveBytes);
    if (actualIntegrity !== expectedIntegrity) {
      return yield* makeCliError({
        code: "SOURCE_FETCH_FAILED",
        what: `Integrity mismatch for ${type}:${name}@${version}`,
        details: [`Expected ${expectedIntegrity}, got ${actualIntegrity}`],
      });
    }

    const fs = yield* FileSystem.FileSystem;
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

    return { directory: tmpDir } satisfies ExtensionFiles;
  });

// -----------------------------------------------------------------------------
// LocalRegistrySourceHostProvider
// -----------------------------------------------------------------------------

/**
 * Creates a local registry source host provider backed by a RegistryClient.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createLocalRegistrySourceHostProvider = (
  client: RegistryClient,
): RegistrySourceHostProviderWithPublish<FileSystem.FileSystem | Path.Path> => ({
  type: "registry",

  match: (url: URL) => Effect.succeed(url.protocol === "file:"),

  find: (source, options) =>
    Effect.gen(function* () {
      const fsService = yield* FileSystem.FileSystem;
      const pathService = yield* Path.Path;
      const extensionsDir = pathService.join(source.location.pathname, "extensions");
      const dirExists = yield* fsService
        .exists(extensionsDir)
        .pipe(Effect.orElseSucceed(() => false));
      if (!dirExists) return [] as ReadonlyArray<ExtensionRef>;

      const entries = yield* fsService
        .readDirectory(extensionsDir)
        .pipe(Effect.orElseSucceed(() => [] as readonly string[]));
      const scopes =
        options.scope !== undefined && Option.isSome(options.scope)
          ? [options.scope.value]
          : entries.filter((d) => d.startsWith("@"));

      const results = yield* Effect.forEach(
        scopes,
        (scope) =>
          Effect.gen(function* () {
            const result = yield* client.getExtensionsByScope(toSearchOptions(scope, options));
            return result.extensions.map((entry) => toExtensionRef(entry, source));
          }),
        { concurrency: "unbounded" },
      );
      return results.flat();
    }),

  fetch: (_source, ref) => fetchRegistryExtension(client, ref),

  publishExtension: (
    scope: string,
    type: ExtensionType,
    name: string,
    version: string,
    archive: Uint8Array,
    metadata: VersionEntry,
  ) => client.publishExtension({ scope, type, name, version, archive, metadata }),
});

// -----------------------------------------------------------------------------
// RemoteRegistrySourceHostProvider
// -----------------------------------------------------------------------------

/**
 * Creates a remote registry source host provider backed by a RegistryClient.
 *
 * All operations delegate to the underlying RemoteRegistryClient, which
 * returns errors for all operations (remote not yet supported).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createRemoteRegistrySourceHostProvider = (
  client: RegistryClient,
): RegistrySourceHostProviderWithPublish<FileSystem.FileSystem | Path.Path> => ({
  type: "registry",

  match: (url: URL) => Effect.succeed(url.protocol === "https:"),

  find: (source, options) =>
    Effect.gen(function* () {
      const scope =
        options.scope !== undefined && Option.isSome(options.scope) ? options.scope.value : "*";
      const searchOptions = toSearchOptions(scope, options);
      const result = yield* client.getExtensionsByScope(searchOptions);
      return result.extensions.map((entry) => toExtensionRef(entry, source));
    }),

  fetch: (_source, ref) => fetchRegistryExtension(client, ref),

  publishExtension: (
    scope: string,
    type: ExtensionType,
    name: string,
    version: string,
    archive: Uint8Array,
    metadata: VersionEntry,
  ) => client.publishExtension({ scope, type, name, version, archive, metadata }),
});

// -----------------------------------------------------------------------------
// Factory
// -----------------------------------------------------------------------------

/**
 * Create a registry source host provider for a given RegistrySourceHost.
 *
 * Creates the appropriate RegistryClient internally based on the host's
 * location protocol, then wraps it in the matching host provider.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createRegistrySourceHostProviderFromHost = (host: RegistrySourceHost) =>
  Effect.gen(function* () {
    const location = host.location;
    const locationStr = location.protocol === "file:" ? location.pathname : location.href;
    const client = yield* createRegistryClient(locationStr);

    if (location.protocol === "file:" || !location.protocol.startsWith("http")) {
      return createLocalRegistrySourceHostProvider(client);
    }

    return createRemoteRegistrySourceHostProvider(client);
  });
