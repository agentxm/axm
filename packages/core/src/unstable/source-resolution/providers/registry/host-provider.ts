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
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as Scope from "effect/Scope";

import { type AppError, makeAppError } from "../../../app-error/index.js";
import { decodeHandleSync, type Handle } from "../../../extensions/handle.js";
import type {
  RegistryClient,
  RegistryExtensionManifest,
  GetExtensionsByOwnerArgs,
} from "../../../registry/index.js";
import {
  packagesToPackageUrlParts,
  createRegistryClient,
  extractZip,
  resolveVersionEntryWithReleaseAge,
  extensionLifecycleWarnings,
} from "../../../registry/index.js";
import { computeIntegrity } from "../../../utils/index.js";
import {
  decodeExtensionNameSync,
  installableExtensionTypes,
  isInstallableExtensionType,
  toAuthor,
  type Author,
  type ExtensionName,
  type ExtensionType,
} from "../../../extensions/index.js";
import type { ExtensionRef } from "../../../extensions/index.js";
import type {
  ExtensionFiles,
  FindOptions,
  SourceHostProvider,
  RegistrySource,
  RegistrySourceHost,
} from "../../../sources/index.js";
import type { ExtensionIndex, VersionEntry } from "../../../registry/index.js";
import type { Version } from "../../../version-constraints/version-constraints.js";

type RegistrySourceHostProviderWithPublish<R = never> = SourceHostProvider<RegistrySource, R> & {
  readonly publishExtension: (
    owner: Handle,
    type: ExtensionType,
    name: ExtensionName,
    version: Version,
    archive: Uint8Array,
    metadata: VersionEntry,
  ) => Effect.Effect<void, AppError, R>;
};

// -----------------------------------------------------------------------------
// Type Mapping Helpers
// -----------------------------------------------------------------------------

/** Map FindOptions + owner to GetExtensionsByOwnerArgs (no pagination — fetch all). */
const toSearchOptions = (owner: "*", options: FindOptions): GetExtensionsByOwnerArgs => ({
  owner,
  names: options.names,
  types: options.type === "*" ? [] : [options.type],
  limit: Option.none(),
  offset: 0,
});

const toRegistrySearchOptions = (
  owner: Handle,
  options: FindOptions,
): GetExtensionsByOwnerArgs => ({
  owner,
  names: options.names,
  types: options.type === "*" ? [] : [options.type],
  limit: Option.none(),
  offset: 0,
});

const authorToMetadata = (author: Author): Record<string, string> => ({
  name: author.name,
  ...(Option.isSome(author.email) && { email: author.email.value }),
  ...(Option.isSome(author.url) && { url: author.url.value }),
});

const getSupportedExtensionRefs = (
  entries: ReadonlyArray<RegistryExtensionManifest>,
  source: RegistrySource,
): ReadonlyArray<ExtensionRef> =>
  Array.getSomes(entries.map((entry) => toExtensionRef(entry, source)));

const needsIndexBackedResolution = (options: FindOptions): boolean =>
  Option.isSome(options.versionRange) || Option.isSome(options.releaseAgePolicy ?? Option.none());

const manifestFromIndex = (
  index: ExtensionIndex,
  versionRange: Option.Option<string>,
  releaseAgePolicy: FindOptions["releaseAgePolicy"],
): Option.Option<RegistryExtensionManifest> => {
  const selectedVersion = resolveVersionEntryWithReleaseAge(
    index.versions,
    versionRange,
    releaseAgePolicy ?? Option.none(),
  );
  if (Option.isNone(selectedVersion)) return Option.none();

  const version = selectedVersion.value;
  const lifecycleWarnings = extensionLifecycleWarnings(index, version);
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
    dependencies: version.dependencies ?? {},
    version: version.version,
    integrity: version.integrity,
    packages: packagesToPackageUrlParts(version.packages),
    ...(lifecycleWarnings.length === 0 ? {} : { lifecycleWarnings }),
  } satisfies RegistryExtensionManifest);
};

const findWithVersionRange = (
  client: RegistryClient,
  source: RegistrySource,
  owners: ReadonlyArray<Handle>,
  options: FindOptions,
) =>
  Effect.forEach(
    owners,
    (owner) =>
      Effect.gen(function* () {
        const requestedTypes: ReadonlyArray<ExtensionType> =
          options.type === "*" ? installableExtensionTypes : [options.type];
        const requestedNames = options.names.length > 0 ? options.names : [];

        if (requestedNames.length === 0) {
          const result = yield* client.getExtensionsByScope(
            toRegistrySearchOptions(owner, options),
          );
          const resolved = yield* Effect.forEach(
            result.extensions,
            (entry) =>
              client
                .getExtensionIndex({
                  owner: entry.owner,
                  type: entry.type,
                  name: entry.name,
                })
                .pipe(
                  Effect.map((indexOption) =>
                    Option.match(indexOption, {
                      onNone: () => Option.none<RegistryExtensionManifest>(),
                      onSome: (index) =>
                        manifestFromIndex(index, options.versionRange, options.releaseAgePolicy),
                    }),
                  ),
                ),
            { concurrency: "unbounded" },
          );

          return getSupportedExtensionRefs(Array.getSomes(resolved), source);
        }

        const resolved = yield* Effect.forEach(
          requestedNames,
          (name) =>
            Effect.forEach(
              requestedTypes,
              (type) =>
                Effect.sync(() => {
                  try {
                    return decodeExtensionNameSync(name);
                  } catch {
                    return undefined;
                  }
                }).pipe(
                  Effect.flatMap((decodedName) =>
                    decodedName === undefined
                      ? Effect.succeed(Option.none<RegistryExtensionManifest>())
                      : client.getExtensionIndex({ owner, type, name: decodedName }).pipe(
                          Effect.map((indexOption) =>
                            Option.match(indexOption, {
                              onNone: () => Option.none<RegistryExtensionManifest>(),
                              onSome: (index) =>
                                manifestFromIndex(
                                  index,
                                  options.versionRange,
                                  options.releaseAgePolicy,
                                ),
                            }),
                          ),
                        ),
                  ),
                ),
              { concurrency: "unbounded" },
            ),
          { concurrency: "unbounded" },
        );

        return resolved.flat().flatMap((entry) =>
          Option.match(entry, {
            onNone: () => [],
            onSome: (manifest) => getSupportedExtensionRefs([manifest], source),
          }),
        );
      }),
    { concurrency: "unbounded" },
  ).pipe(Effect.map((results) => results.flat()));

/** Map RegistryExtensionManifest to ExtensionRef, stamped with the source. */
const toExtensionRef = (
  entry: RegistryExtensionManifest,
  source: RegistrySource,
): Option.Option<ExtensionRef> => {
  if (entry.type !== "files" && !isInstallableExtensionType(entry.type)) {
    return Option.none();
  }

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
    owner: entry.owner,
    name: entry.name,
    version: entry.version,
    integrity: Option.fromUndefinedOr(entry.integrity || undefined),
    packages: entry.packages,
    ...(entry.lifecycleWarnings === undefined
      ? {}
      : { lifecycleWarnings: entry.lifecycleWarnings }),
  };

  switch (entry.type) {
    case "skill":
      return Option.some({
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
      });
    case "mcp-server":
      return Option.some({
        type: "mcp-server",
        refType: "registry" as const,
        server: { name: entry.name },
        source,
        ...details,
      });
    case "command":
      return Option.some({
        type: "command",
        refType: "registry" as const,
        command: { name: entry.name },
        source,
        ...details,
      });
    case "subagent":
      return Option.some({
        type: "subagent",
        refType: "registry" as const,
        subagent: { name: entry.name, description: entry.description },
        source,
        ...details,
      });
    case "files":
      return Option.some({
        type: "files",
        refType: "registry" as const,
        file: { name: entry.name },
        source,
        ...details,
      });
    case "rule":
      return Option.some({
        type: "rule",
        refType: "registry" as const,
        rule: { name: entry.name },
        source,
        ...details,
      });
    case "hook":
      return Option.some({
        type: "hook",
        refType: "registry" as const,
        hook: { name: entry.name },
        source,
        ...details,
      });
    case "pack":
      return Option.some({
        type: "pack",
        refType: "registry" as const,
        pack: { name: entry.name, dependencies },
        source,
        ...details,
      });
  }
};

/** Extract extension name from an ExtensionRef. */
const refName = (ref: ExtensionRef): ExtensionName => {
  switch (ref.type) {
    case "skill":
      return ref.skill.name;
    case "command":
      return ref.command.name;
    case "mcp-server":
      return ref.server.name;
    case "pack":
      return ref.pack.name;
    case "subagent":
      return ref.subagent.name;
    case "files":
      return ref.file.name;
    case "rule":
      return ref.rule.name;
    case "hook":
      return ref.hook.name;
  }
};

/** Map ExtensionRef type to ExtensionType. */
const refRegistryType = (ref: ExtensionRef): ExtensionType => ref.type;

const fetchRegistryExtension = (client: RegistryClient, ref: ExtensionRef) =>
  Effect.gen(function* () {
    if (ref.refType !== "registry") {
      return yield* makeAppError({
        code: "network",
        detail: "Ref missing registry details (owner, version, integrity)",
      });
    }

    const { owner, version, integrity: expectedIntegrity } = ref;
    const type = refRegistryType(ref);
    const name = refName(ref);

    const { archive: archiveBytes, warnings } = yield* client.getExtensionPackage({
      owner,
      type,
      name,
      version: Option.some(version),
    });
    if (warnings !== undefined) {
      yield* Effect.forEach(warnings, (warning) => Effect.logWarning(warning), {
        discard: true,
      });
    }

    if (Option.isSome(expectedIntegrity)) {
      const actualIntegrity = yield* computeIntegrity(archiveBytes);
      if (actualIntegrity !== expectedIntegrity.value) {
        return yield* makeAppError({
          code: "network",
          detail: `Integrity mismatch for ${type}:${name}@${version}`,
        });
      }
    }

    const fs = yield* FileSystem.FileSystem;
    const tmpDir = yield* Effect.acquireRelease(
      fs.makeTempDirectory().pipe(
        Effect.mapError((e) =>
          makeAppError({
            code: "network",
            detail: "Temporary source directory could not be created",
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
      const namespaces: ReadonlyArray<Handle> = Option.isSome(options.owner)
        ? [options.owner.value]
        : entries.filter((d) => d.startsWith("@")).map((entry) => decodeHandleSync(entry));

      if (needsIndexBackedResolution(options)) {
        return yield* findWithVersionRange(client, source, namespaces, options);
      }

      const results = yield* Effect.forEach(
        namespaces,
        (owner) =>
          Effect.gen(function* () {
            const result = yield* client.getExtensionsByScope(
              toRegistrySearchOptions(owner, options),
            );
            return getSupportedExtensionRefs(result.extensions, source);
          }),
        { concurrency: "unbounded" },
      );
      return results.flat();
    }),

  fetch: (_source, ref) => fetchRegistryExtension(client, ref),

  publishExtension: (
    owner: Handle,
    type: ExtensionType,
    name: ExtensionName,
    version: Version,
    archive: Uint8Array,
    metadata: VersionEntry,
  ) => client.publishExtension({ owner, type, name, version, archive, metadata }),
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
      const owner: Handle | "*" = Option.isSome(options.owner) ? options.owner.value : "*";
      if (needsIndexBackedResolution(options) && owner !== "*") {
        return yield* findWithVersionRange(client, source, [owner], options);
      }
      const searchOptions =
        owner === "*" ? toSearchOptions("*", options) : toRegistrySearchOptions(owner, options);
      const result = yield* client.getExtensionsByScope(searchOptions);
      return getSupportedExtensionRefs(result.extensions, source);
    }),

  fetch: (_source, ref) => fetchRegistryExtension(client, ref),

  publishExtension: (
    owner: Handle,
    type: ExtensionType,
    name: ExtensionName,
    version: Version,
    archive: Uint8Array,
    metadata: VersionEntry,
  ) => client.publishExtension({ owner, type, name, version, archive, metadata }),
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
