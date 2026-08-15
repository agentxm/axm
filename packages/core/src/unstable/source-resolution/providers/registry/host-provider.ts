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
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as Scope from "effect/Scope";
import * as semver from "semver";

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
  resolveVersionEntryForReleaseAge,
  extensionLifecycleWarnings,
  isVersionEntryEligibleAt,
  releaseAgeEvidence,
  releaseAgeExemptionForIdentity,
} from "../../../registry/index.js";
import { evaluateAxmSkillCandidate } from "../../../skills/index.js";
import { computeIntegrity } from "../../../utils/index.js";
import {
  decodeExtensionNameSync,
  installableExtensionTypes,
  isInstallableExtensionType,
  toExtensionTypePlural,
  toAuthor,
  type Author,
  type ExtensionName,
  type ExtensionType,
} from "../../../extensions/index.js";
import type { ExtensionRef } from "../../../extensions/index.js";
import type {
  ExtensionFiles,
  FindOptions,
  NamedRegistryFindOptions,
  NamedRegistryResolution,
  SourceHostProvider,
  RegistrySource,
  RegistrySourceHost,
} from "../../../sources/index.js";
import type { ExtensionIndex, VersionEntry } from "../../../registry/index.js";
type RegistrySourceHostProvider<R = never> = SourceHostProvider<RegistrySource, R> & {
  readonly resolveNamed: (
    source: RegistrySource,
    options: NamedRegistryFindOptions,
  ) => Effect.Effect<NamedRegistryResolution, AppError, R>;
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
  Option.isSome(options.versionRange) || Option.isSome(options.minimumReleaseAge ?? Option.none());

const manifestFromIndex = (
  index: ExtensionIndex,
  versionRange: Option.Option<string>,
  minimumReleaseAge: FindOptions["minimumReleaseAge"],
): Effect.Effect<Option.Option<RegistryExtensionManifest>> =>
  Effect.gen(function* () {
    const selectedVersion = yield* resolveVersionEntryWithReleaseAge(
      index.versions,
      versionRange,
      minimumReleaseAge ?? Option.none(),
    );
    if (Option.isNone(selectedVersion)) return Option.none();

    const version = selectedVersion.value;
    const lifecycleWarnings = extensionLifecycleWarnings(index, version);
    return Option.some({
      owner: index.owner,
      type: index.type,
      name: index.name,
      publisherBindingId: index.publisherBindingId,
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
  });

const namedTarget = (options: NamedRegistryFindOptions): string =>
  `${options.owner}/${toExtensionTypePlural(options.type)}/${options.name}`;

const isOfficialAxmSkill = (options: NamedRegistryFindOptions): boolean =>
  options.type === "skill" && options.owner === "@agentxm" && options.name === "axm";

const manifestForVersion = (
  index: ExtensionIndex,
  version: VersionEntry,
): RegistryExtensionManifest => {
  const lifecycleWarnings = extensionLifecycleWarnings(index, version);
  return {
    owner: index.owner,
    type: index.type,
    name: index.name,
    publisherBindingId: index.publisherBindingId,
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
  };
};

const versionsMatchingNamedOptions = (
  versions: ReadonlyArray<VersionEntry>,
  options: NamedRegistryFindOptions,
  exempt: boolean,
): ReadonlyArray<VersionEntry> => {
  const requested = Option.getOrElse(options.versionRange, () => "*");
  const exact = semver.valid(requested) === requested;
  return versions
    .filter((entry) =>
      exact
        ? entry.version === requested
        : entry.yankedAt === undefined && semver.satisfies(entry.version, requested),
    )
    .filter((entry) => exempt || isVersionEntryEligibleAt(entry, options.releaseAgeEvaluation))
    .sort((left, right) => semver.compareBuild(right.version, left.version));
};

const probeAxmSkillCompatibility = (
  client: RegistryClient,
  source: RegistrySource,
  index: ExtensionIndex,
  version: VersionEntry,
) =>
  Effect.gen(function* () {
    const manifest = manifestForVersion(index, version);
    const ref = toExtensionRef(manifest, source);
    if (Option.isNone(ref) || ref.value.type !== "skill") {
      return yield* makeAppError({
        code: "internal",
        detail: "Registry returned an invalid official AXM skill candidate",
      });
    }
    const { archive } = yield* client.getExtensionPackage({
      owner: index.owner,
      type: index.type,
      name: index.name,
      version: Option.some(version.version),
      usagePurpose: "verification",
    });
    const actualIntegrity = yield* computeIntegrity(archive);
    if (actualIntegrity !== version.integrity) {
      return yield* makeAppError({
        code: "network",
        detail: `Integrity mismatch for skill:${index.name}@${version.version}`,
      });
    }

    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* Effect.acquireRelease(
      fs.makeTempDirectory().pipe(
        Effect.mapError((cause) =>
          makeAppError({
            code: "network",
            detail: "Temporary compatibility-probe directory could not be created",
            cause,
          }),
        ),
      ),
      (directory) => fs.remove(directory, { recursive: true }).pipe(Effect.ignore),
    );
    yield* extractZip(archive, tmpDir);
    const result = yield* evaluateAxmSkillCandidate({
      ref: ref.value,
      packageRoot: tmpDir,
      skillSourcePath: path.join(tmpDir, "src"),
    });
    if (result === null) {
      return yield* makeAppError({
        code: "internal",
        detail: "Official AXM skill compatibility probe returned no result",
      });
    }
    return { result, ref: ref.value } as const;
  });

const resolveNamedFromClient = (
  client: RegistryClient,
  source: RegistrySource,
  options: NamedRegistryFindOptions,
): Effect.Effect<
  NamedRegistryResolution,
  AppError,
  FileSystem.FileSystem | Path.Path | Scope.Scope
> =>
  Effect.gen(function* () {
    const indexOption = yield* client.getExtensionIndex({
      owner: options.owner,
      type: options.type,
      name: decodeExtensionNameSync(options.name),
    });
    const target = namedTarget(options);
    if (Option.isNone(indexOption)) {
      return { kind: "not_found", target } as const;
    }

    const exemption = releaseAgeExemptionForIdentity(options.releaseAgeEvaluation, {
      owner: indexOption.value.owner,
      type: indexOption.value.type,
      name: indexOption.value.name,
    });
    const resolution = resolveVersionEntryForReleaseAge(
      indexOption.value.versions,
      options.versionRange,
      options.releaseAgeEvaluation,
      exemption,
    );
    if (resolution.kind === "version_unsatisfied") {
      const requested = Option.getOrUndefined(options.versionRange);
      if (requested !== undefined && semver.valid(requested) === requested) {
        return { kind: "not_found", target } as const;
      }
      return {
        kind: "version_unsatisfied",
        target,
        requestedRange: Option.getOrElse(options.versionRange, () => "*"),
      } as const;
    }
    if (resolution.kind === "policy_held") {
      return {
        kind: "policy_held",
        target,
        ...(Option.isSome(options.versionRange)
          ? { requestedRange: options.versionRange.value }
          : {}),
        candidate: resolution.candidate,
      } as const;
    }

    if (isOfficialAxmSkill(options)) {
      const requested = Option.getOrElse(options.versionRange, () => "*");
      const exactRequest = semver.valid(requested) === requested;
      const probeCandidate = (candidate: VersionEntry) =>
        probeAxmSkillCompatibility(client, source, indexOption.value, candidate).pipe(
          Effect.map(Option.some),
          Effect.catchIf(
            (error) => !exactRequest && error.code === "not_found",
            () => Effect.succeed(Option.none()),
          ),
        );
      const candidates = versionsMatchingNamedOptions(
        indexOption.value.versions,
        options,
        exemption !== undefined,
      );
      let latestIncompatibility: string | null = null;
      for (const candidate of candidates) {
        const probe = yield* probeCandidate(candidate);
        if (Option.isNone(probe)) continue;
        const probed = probe.value;
        if (probed.result.status === "incompatible") {
          latestIncompatibility = probed.result.detail;
          continue;
        }
        if (
          exemption !== undefined &&
          !isVersionEntryEligibleAt(candidate, options.releaseAgeEvaluation)
        ) {
          return {
            kind: "exempted",
            target,
            ref: probed.ref,
            bypassed: releaseAgeEvidence(candidate, options.releaseAgeEvaluation),
            exemption,
          } as const;
        }
        return {
          kind: "selected",
          target,
          ref: probed.ref,
          ...(resolution.kind === "selected" && resolution.newerHeld !== undefined
            ? { newerHeld: resolution.newerHeld }
            : {}),
        } as const;
      }

      if (exemption === undefined) {
        const heldCandidates = versionsMatchingNamedOptions(
          indexOption.value.versions,
          options,
          true,
        ).filter((candidate) => !isVersionEntryEligibleAt(candidate, options.releaseAgeEvaluation));
        for (const candidate of heldCandidates) {
          const probe = yield* probeCandidate(candidate);
          if (Option.isNone(probe) || probe.value.result.status === "incompatible") continue;
          return {
            kind: "policy_held",
            target,
            ...(Option.isSome(options.versionRange)
              ? { requestedRange: options.versionRange.value }
              : {}),
            candidate: releaseAgeEvidence(candidate, options.releaseAgeEvaluation),
          } as const;
        }
      }

      if (exactRequest) {
        return yield* makeAppError({
          code: "conflict",
          detail:
            latestIncompatibility ??
            `The official AXM skill release ${requested} is incompatible with this AXM CLI.`,
          recover: "Install a compatible Registry release, or recover with the bundled AXM skill",
          cmd: "axm skills install @agentxm/skills/axm --bundled",
        });
      }
      return { kind: "not_found", target } as const;
    }

    const version = resolution.version;
    const manifest = manifestForVersion(indexOption.value, version);
    const ref = toExtensionRef(manifest, source);
    if (Option.isNone(ref)) {
      return yield* makeAppError({
        code: "internal",
        detail: `Registry returned unsupported extension type for ${target}`,
      });
    }
    return resolution.kind === "exempted"
      ? ({
          kind: "exempted",
          target,
          ref: ref.value,
          bypassed: resolution.bypassed,
          exemption: resolution.exemption,
        } as const)
      : ({
          kind: "selected",
          target,
          ref: ref.value,
          ...(resolution.newerHeld === undefined ? {} : { newerHeld: resolution.newerHeld }),
        } as const);
  });

const findOfficialAxmSkill = (
  client: RegistryClient,
  source: RegistrySource,
  options: FindOptions,
) =>
  Effect.gen(function* () {
    const owner = Option.getOrNull(Option.isSome(options.owner) ? options.owner : source.owner);
    if (
      owner !== "@agentxm" ||
      options.type !== "skill" ||
      options.names.length !== 1 ||
      options.names[0] !== "axm"
    ) {
      return Option.none<ReadonlyArray<ExtensionRef>>();
    }
    const evaluatedAt = yield* DateTime.now;
    const resolution = yield* resolveNamedFromClient(client, source, {
      owner,
      type: "skill",
      name: "axm",
      versionRange: options.versionRange,
      releaseAgeEvaluation: {
        minimumReleaseAge: Option.getOrElse(
          options.minimumReleaseAge ?? Option.none(),
          () => Duration.zero,
        ),
        evaluatedAt,
        mode: "enforce",
      },
    });
    return Option.some(resolution.kind === "selected" ? [resolution.ref] : []);
  });

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
                  Effect.flatMap((indexOption) =>
                    Option.match(indexOption, {
                      onNone: () => Effect.succeed(Option.none<RegistryExtensionManifest>()),
                      onSome: (index) =>
                        manifestFromIndex(index, options.versionRange, options.minimumReleaseAge),
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
                          Effect.flatMap((indexOption) =>
                            Option.match(indexOption, {
                              onNone: () =>
                                Effect.succeed(Option.none<RegistryExtensionManifest>()),
                              onSome: (index) =>
                                manifestFromIndex(
                                  index,
                                  options.versionRange,
                                  options.minimumReleaseAge,
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
): Option.Option<Extract<ExtensionRef, { readonly refType: "registry" }>> => {
  if (!isInstallableExtensionType(entry.type)) {
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
    publisherBindingId: entry.publisherBindingId,
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
    case "subagent":
      return Option.some({
        type: "subagent",
        refType: "registry" as const,
        subagent: { name: entry.name, description: entry.description },
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
    case "knowledge":
      return Option.some({
        type: "knowledge",
        refType: "registry" as const,
        knowledge: { name: entry.name },
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
    case "mcp-server":
      return ref.server.name;
    case "pack":
      return ref.pack.name;
    case "subagent":
      return ref.subagent.name;
    case "rule":
      return ref.rule.name;
    case "hook":
      return ref.hook.name;
    case "knowledge":
      return ref.knowledge.name;
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
): RegistrySourceHostProvider<FileSystem.FileSystem | Path.Path | Scope.Scope> => ({
  type: "registry",

  match: (url: URL) => Effect.succeed(url.protocol === "file:"),

  resolveNamed: (source, options) => resolveNamedFromClient(client, source, options),

  find: (source, options) =>
    Effect.gen(function* () {
      const compatibleAxmSkill = yield* findOfficialAxmSkill(client, source, options);
      if (Option.isSome(compatibleAxmSkill)) return compatibleAxmSkill.value;

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
): RegistrySourceHostProvider<FileSystem.FileSystem | Path.Path | Scope.Scope> => ({
  type: "registry",

  match: (url: URL) => Effect.succeed(url.protocol === "https:"),

  resolveNamed: (source, options) => resolveNamedFromClient(client, source, options),

  find: (source, options) =>
    Effect.gen(function* () {
      const compatibleAxmSkill = yield* findOfficialAxmSkill(client, source, options);
      if (Option.isSome(compatibleAxmSkill)) return compatibleAxmSkill.value;

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
