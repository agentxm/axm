/**
 * Registry source host provider implementations.
 *
 * Thin adapters between SourceHostProvider contract and RegistryClient.
 * Type mapping at the boundary keeps registry and source domains separated.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as Scope from "effect/Scope";

import { type AppError, makeAppError } from "@axm.sh/core/unstable/app-error";
import type {
  RegistryClient,
  RegistryExtensionManifest,
  GetExtensionsByProfileArgs,
} from "../../../registry/index.js";
import { createRegistryClient, extractZip } from "../../../registry/index.js";
import { computeIntegrity } from "@axm.sh/core/unstable/utils";
import type { Author, ExtensionType } from "@axm.sh/core/unstable/extensions";
import type {
  ExtensionFiles,
  FindOptions,
  SourceHostProvider,
  RegistrySource,
  RegistrySourceHost,
  ExtensionRef,
} from "@axm.sh/core/unstable/sources";
import type { VersionEntry } from "../../../registry/index.js";

type RegistrySourceHostProviderWithPublish<R = never> = SourceHostProvider<RegistrySource, R> & {
  readonly publishExtension: (
    profile: string,
    type: ExtensionType,
    name: string,
    version: string,
    archive: Uint8Array,
    metadata: VersionEntry,
  ) => Effect.Effect<void, AppError, R>;
};

// -----------------------------------------------------------------------------
// Type Mapping Helpers
// -----------------------------------------------------------------------------

/** Map FindOptions + profile to GetExtensionsByProfileArgs (no pagination — fetch all). */
const toSearchOptions = (profile: string, options: FindOptions): GetExtensionsByProfileArgs => ({
  handle: profile,
  names: options.skillNames,
  types: options.type === "*" ? [] : [options.type],
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
    profile: entry.profile,
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
    case "command":
      return {
        type: "command",
        refType: "registry" as const,
        command: { name: entry.name },
        source,
        ...details,
      };
    case "pack": {
      const skills: Record<string, string> = {};
      const commands: Record<string, string> = {};
      const mcpServers: Record<string, string> = {};
      for (const [key, version] of Object.entries(dependencies)) {
        if (key.includes("/skills/")) skills[key] = version;
        else if (key.includes("/commands/")) commands[key] = version;
        else if (key.includes("/mcp-servers/")) mcpServers[key] = version;
      }
      return {
        type: "pack",
        refType: "registry" as const,
        pack: { name: entry.name, skills, commands, mcpServers },
        source,
        ...details,
      };
    }
  }
};

/** Extract extension name from an ExtensionRef. */
const refName = (ref: ExtensionRef): string => {
  switch (ref.type) {
    case "skill":
      return ref.skill.name;
    case "command":
      return ref.command.name;
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
      return yield* makeAppError({
        code: "SOURCE_FETCH_FAILED",
        what: "Ref missing registry details (profile, version, integrity)",
      });
    }

    const { profile, version, integrity: expectedIntegrity } = ref;
    const type = refRegistryType(ref);
    const name = refName(ref);

    const { archive: archiveBytes } = yield* client.getExtensionPackage({
      handle: profile,
      type,
      name,
      version: Option.some(version),
    });

    const actualIntegrity = yield* computeIntegrity(archiveBytes);
    if (actualIntegrity !== expectedIntegrity) {
      return yield* makeAppError({
        code: "SOURCE_FETCH_FAILED",
        what: `Integrity mismatch for ${type}:${name}@${version}`,
        details: [`Expected ${expectedIntegrity}, got ${actualIntegrity}`],
      });
    }

    const fs = yield* FileSystem.FileSystem;
    const tmpDir = yield* Effect.acquireRelease(
      fs.makeTempDirectory().pipe(
        Effect.mapError((e) =>
          makeAppError({
            code: "SOURCE_FETCH_FAILED",
            what: "Failed to create temp directory",
            cause: e,
          }),
        ),
      ),
      (dir) => fs.remove(dir, { recursive: true }).pipe(Effect.ignore),
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
): RegistrySourceHostProviderWithPublish<FileSystem.FileSystem | Path.Path | Scope.Scope> => ({
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
      if (!dirExists) return [];

      const entries = yield* fsService
        .readDirectory(extensionsDir)
        .pipe(Effect.orElseSucceed((): readonly string[] => []));
      const namespaces = Option.isSome(options.profile)
        ? [options.profile.value]
        : entries.filter((d) => d.startsWith("@"));

      const results = yield* Effect.forEach(
        namespaces,
        (profile) =>
          Effect.gen(function* () {
            const result = yield* client.getExtensionsByScope(toSearchOptions(profile, options));
            return result.extensions.map((entry) => toExtensionRef(entry, source));
          }),
        { concurrency: "unbounded" },
      );
      return results.flat();
    }),

  fetch: (_source, ref) => fetchRegistryExtension(client, ref),

  publishExtension: (
    profile: string,
    type: ExtensionType,
    name: string,
    version: string,
    archive: Uint8Array,
    metadata: VersionEntry,
  ) => client.publishExtension({ handle: profile, type, name, version, archive, metadata }),
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
): RegistrySourceHostProviderWithPublish<FileSystem.FileSystem | Path.Path | Scope.Scope> => ({
  type: "registry",

  match: (url: URL) => Effect.succeed(url.protocol === "https:"),

  find: (source, options) =>
    Effect.gen(function* () {
      const profile = Option.isSome(options.profile) ? options.profile.value : "*";
      const searchOptions = toSearchOptions(profile, options);
      const result = yield* client.getExtensionsByScope(searchOptions);
      return result.extensions.map((entry) => toExtensionRef(entry, source));
    }),

  fetch: (_source, ref) => fetchRegistryExtension(client, ref),

  publishExtension: (
    profile: string,
    type: ExtensionType,
    name: string,
    version: string,
    archive: Uint8Array,
    metadata: VersionEntry,
  ) => client.publishExtension({ handle: profile, type, name, version, archive, metadata }),
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
