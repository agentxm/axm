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

import { makeCliError } from "../../../cli-error/index.js";
import type {
  RegistryClient,
  RegistryExtensionEntry,
  GetExtensionsArgs,
} from "../../../registry/index.js";
import { createRegistryClient, extractZip } from "../../../registry/index.js";
import { computeChecksum } from "../../../utils/checksum.js";
import type { ExtensionType } from "../../../extensions/common.js";
import type { ExtensionFiles, FindOptions, PublishableSourceHostProvider } from "../../provider.js";
import type { RegistrySource, RegistrySourceHost, SourceExtensionRef } from "../../types.js";
import type { VersionEntry } from "../../../registry/index.js";

// -----------------------------------------------------------------------------
// Type Mapping Helpers
// -----------------------------------------------------------------------------

/** Map FindOptions to GetExtensionsArgs. */
const toSearchOptions = (options: FindOptions): GetExtensionsArgs => ({
  names: options.names,
  agents: options.agents,
  type: options.type === "*" ? "*" : (options.type as ExtensionType),
});

/** Map RegistryExtensionEntry to SourceExtensionRef, stamped with the source. */
const toSourceExtensionRef = (
  entry: RegistryExtensionEntry,
  source: RegistrySource,
): SourceExtensionRef => {
  const details = {
    scope: entry.scope,
    version: entry.version,
    checksum: entry.checksum,
  };

  switch (entry.type) {
    case "skill":
      return {
        type: "skill",
        skill: {
          name: entry.name,
          description: "",
          metadata: Option.none(),
        },
        source,
        ...details,
      };
    case "mcp-server":
      return {
        type: "mcp-server",
        server: { name: entry.name },
        source,
        ...details,
      };
    case "pack":
      return {
        type: "pack",
        pack: { name: entry.name },
        source,
        ...details,
      };
  }
};

/** Extract extension name from a SourceExtensionRef. */
const refName = (ref: SourceExtensionRef): string => {
  switch (ref.type) {
    case "skill":
      return ref.skill.name;
    case "mcp-server":
      return ref.server.name;
    case "pack":
      return ref.pack.name;
  }
};

/** Map SourceExtensionRef type to ExtensionType. */
const refRegistryType = (ref: SourceExtensionRef): ExtensionType => ref.type;

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
): PublishableSourceHostProvider<RegistrySource, FileSystem.FileSystem | Path.Path> => ({
  type: "registry",

  match: (url: URL) => Effect.succeed(url.protocol === "file:"),

  find: (source, options) =>
    Effect.gen(function* () {
      const searchOptions = toSearchOptions(options);
      const entries = yield* client.getExtensions(searchOptions);
      return entries.map((entry) => toSourceExtensionRef(entry, source));
    }),

  fetch: (_source, ref) =>
    Effect.gen(function* () {
      if (!("scope" in ref) || !("version" in ref) || !("checksum" in ref)) {
        return yield* makeCliError({
          code: "SOURCE_FETCH_FAILED",
          what: "Ref missing registry details (scope, version, checksum)",
        });
      }

      const scope = ref.scope as string;
      const version = ref.version as string;
      const expectedChecksum = ref.checksum as string;
      const type = refRegistryType(ref);
      const name = refName(ref);

      const archiveBytes = yield* client.getExtension(scope, type, name, version);

      const actualChecksum = yield* computeChecksum(archiveBytes);
      if (actualChecksum !== expectedChecksum) {
        return yield* makeCliError({
          code: "SOURCE_FETCH_FAILED",
          what: `Checksum mismatch for ${type}:${name}@${version}`,
          details: [`Expected ${expectedChecksum}, got ${actualChecksum}`],
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
    }),

  publishExtension: (
    scope: string,
    type: ExtensionType,
    name: string,
    version: string,
    archive: Uint8Array,
    metadata: VersionEntry,
  ) => client.publishExtension(scope, type, name, version, archive, metadata),
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
): PublishableSourceHostProvider<RegistrySource, FileSystem.FileSystem | Path.Path> => ({
  type: "registry",

  match: (url: URL) => Effect.succeed(url.protocol === "https:"),

  find: (source, options) =>
    Effect.gen(function* () {
      const searchOptions = toSearchOptions(options);
      const entries = yield* client.getExtensions(searchOptions);
      return entries.map((entry) => toSourceExtensionRef(entry, source));
    }),

  fetch: (_source, ref) =>
    Effect.gen(function* () {
      if (!("scope" in ref) || !("version" in ref) || !("checksum" in ref)) {
        return yield* makeCliError({
          code: "SOURCE_FETCH_FAILED",
          what: "Ref missing registry details (scope, version, checksum)",
        });
      }

      const scope = ref.scope as string;
      const version = ref.version as string;
      const expectedChecksum = ref.checksum as string;
      const type = refRegistryType(ref);
      const name = refName(ref);

      const archiveBytes = yield* client.getExtension(scope, type, name, version);

      const actualChecksum = yield* computeChecksum(archiveBytes);
      if (actualChecksum !== expectedChecksum) {
        return yield* makeCliError({
          code: "SOURCE_FETCH_FAILED",
          what: `Checksum mismatch for ${type}:${name}@${version}`,
          details: [`Expected ${expectedChecksum}, got ${actualChecksum}`],
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
    }),

  publishExtension: (
    scope: string,
    type: ExtensionType,
    name: string,
    version: string,
    archive: Uint8Array,
    metadata: VersionEntry,
  ) => client.publishExtension(scope, type, name, version, archive, metadata),
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
export const createRegistrySourceHostProviderFromHost = (
  host: RegistrySourceHost,
): PublishableSourceHostProvider<RegistrySource, FileSystem.FileSystem | Path.Path> => {
  const location = host.location;
  const locationStr = location.protocol === "file:" ? location.pathname : location.href;
  const client = createRegistryClient(locationStr);

  if (location.protocol === "file:" || !location.protocol.startsWith("http")) {
    return createLocalRegistrySourceHostProvider(client);
  }

  return createRemoteRegistrySourceHostProvider(client);
};
