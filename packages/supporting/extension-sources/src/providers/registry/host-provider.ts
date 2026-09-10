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

import { decodeHandleSync, type Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  createRegistryClient,
  extractZip,
  extensionLifecycleWarnings,
  type RegistryClient,
  type RegistryExtensionManifest,
  type GetExtensionsByOwnerArgs,
} from "@agentxm/registry-client";
import { packagesToPackageUrlParts } from "@agentxm/registry-protocol/unstable/registry";
import { AxmSkillCandidateGate } from "../../axm-skill-gate.js";
import { RegistryResolutionPolicy } from "../../registry-resolution-policy.js";
import {
  SourceNetworkFailure,
  SourceNotResolvable,
  sourceResolutionFailureCategory,
  type SourceResolutionFailure,
} from "../../errors.js";
import { computeIntegrity } from "../../integrity.js";
import {
  decodeExtensionNameSync,
  toExtensionTypePlural,
  toAuthor,
  type Author,
  type ExtensionName,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import {
  installableExtensionTypes,
  isInstallableExtensionType,
} from "@agentxm/extension-model/unstable/extensions/installable-types";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type {
  ExtensionFiles,
  FindOptions,
  NamedRegistryFindOptions,
  NamedRegistryResolution,
  SourceHostProvider,
} from "@agentxm/extension-model/unstable/sources/source-host-provider";
import type {
  RegistrySource,
  RegistrySourceHost,
} from "@agentxm/extension-model/unstable/sources/types";
import type { ExtensionIndex, VersionEntry } from "@agentxm/registry-protocol/unstable/registry";
type RegistryProviderRequirements =
  | FileSystem.FileSystem
  | Path.Path
  | AxmSkillCandidateGate
  | RegistryResolutionPolicy
  | Scope.Scope;

type RegistrySourceHostProvider<R = never> = SourceHostProvider<
  RegistrySource,
  R,
  SourceResolutionFailure
> & {
  readonly resolveNamed: (
    source: RegistrySource,
    options: NamedRegistryFindOptions,
  ) => Effect.Effect<NamedRegistryResolution, SourceResolutionFailure, R>;
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
): Effect.Effect<Option.Option<RegistryExtensionManifest>, never, RegistryResolutionPolicy> =>
  Effect.gen(function* () {
    const policy = yield* RegistryResolutionPolicy;
    const selectedVersion = yield* policy.selectVersion(
      index.versions,
      versionRange,
      minimumReleaseAge ?? Option.none(),
    );
    return Option.map(selectedVersion, (version) => manifestForVersion(index, version));
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
    ...(index.deprecation === null ? {} : { deprecation: index.deprecation }),
    ...(lifecycleWarnings.length === 0 ? {} : { lifecycleWarnings }),
  };
};

/** The index entry a policy decision names; the decision came from this index. */
const entryForVersion = (
  index: ExtensionIndex,
  version: string,
  target: string,
): Effect.Effect<VersionEntry, SourceNotResolvable> =>
  Option.match(Option.fromUndefinedOr(index.versions.find((entry) => entry.version === version)), {
    onNone: () =>
      Effect.fail(
        new SourceNotResolvable({
          category: "internal",
          detail: `Registry index for ${target} does not list the selected version ${version}`,
        }),
      ),
    onSome: Effect.succeed,
  });

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
      return yield* new SourceNotResolvable({
        category: "internal",
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
      return yield* new SourceNetworkFailure({
        detail: `Integrity mismatch for skill:${index.name}@${version.version}`,
      });
    }

    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const gate = yield* AxmSkillCandidateGate;
    const tmpDir = yield* Effect.acquireRelease(
      fs.makeTempDirectory({ prefix: "axm-registry-compatibility-" }).pipe(
        Effect.mapError(
          (cause) =>
            new SourceNetworkFailure({
              detail: "Temporary compatibility-probe directory could not be created",
              cause,
            }),
        ),
      ),
      (directory) => fs.remove(directory, { recursive: true }).pipe(Effect.ignore),
    );
    yield* extractZip(archive, tmpDir);
    const result = yield* gate.evaluate({
      ref: ref.value,
      packageRoot: tmpDir,
      skillSourcePath: path.join(tmpDir, "src"),
    });
    if (result === null) {
      return yield* new SourceNotResolvable({
        category: "internal",
        detail: "Official AXM skill compatibility probe returned no result",
      });
    }
    return { result, ref: ref.value } as const;
  });

const resolveNamedFromClient = (
  client: RegistryClient,
  source: RegistrySource,
  options: NamedRegistryFindOptions,
): Effect.Effect<NamedRegistryResolution, SourceResolutionFailure, RegistryProviderRequirements> =>
  Effect.gen(function* () {
    const policy = yield* RegistryResolutionPolicy;
    const indexOption = yield* client.getExtensionIndex({
      owner: options.owner,
      type: options.type,
      name: decodeExtensionNameSync(options.name),
    });
    const target = namedTarget(options);
    if (Option.isNone(indexOption)) {
      return { kind: "not_found", target } as const;
    }
    const index = indexOption.value;

    const decision = policy.decideNamedVersion(index, options);
    switch (decision.kind) {
      case "not_found":
        return { kind: "not_found", target } as const;
      case "version_unsatisfied":
        return {
          kind: "version_unsatisfied",
          target,
          requestedRange: decision.requestedRange,
        } as const;
      case "policy_held":
        return {
          kind: "policy_held",
          target,
          ...(decision.requestedRange === undefined
            ? {}
            : { requestedRange: decision.requestedRange }),
          candidate: decision.candidate,
        } as const;
      case "selected":
      case "exempted":
        break;
    }

    if (isOfficialAxmSkill(options)) {
      const requested = Option.getOrElse(options.versionRange, () => "*");
      const exactRequest = semver.valid(requested) === requested;
      const probeCandidate = (candidate: VersionEntry) =>
        probeAxmSkillCompatibility(client, source, index, candidate).pipe(
          Effect.map(Option.some),
          Effect.catchIf(
            (error) => !exactRequest && sourceResolutionFailureCategory(error) === "not_found",
            () => Effect.succeed(Option.none()),
          ),
        );
      let latestIncompatibility: string | null = null;
      let latestRecoveryAction: string | null = null;
      let latestRecoveryTarget: string | null = null;
      for (const candidate of policy.namedCandidates(index, options)) {
        const entry = yield* entryForVersion(index, candidate.version, target);
        const probe = yield* probeCandidate(entry);
        if (Option.isNone(probe)) continue;
        const probed = probe.value;
        if (candidate.outcome.kind === "held") {
          if (probed.result.status === "incompatible") continue;
          return {
            kind: "policy_held",
            target,
            ...(Option.isSome(options.versionRange)
              ? { requestedRange: options.versionRange.value }
              : {}),
            candidate: candidate.outcome.candidate,
          } as const;
        }
        if (probed.result.status === "incompatible") {
          latestIncompatibility = probed.result.detail;
          latestRecoveryAction = probed.result.recoveryCommand;
          latestRecoveryTarget = probed.result.recoveryTarget;
          continue;
        }
        if (candidate.outcome.kind === "exempted") {
          return {
            kind: "exempted",
            target,
            ref: probed.ref,
            bypassed: candidate.outcome.bypassed,
            exemption: candidate.outcome.exemption,
          } as const;
        }
        return {
          kind: "selected",
          target,
          ref: probed.ref,
          ...(decision.kind === "selected" && decision.newerHeld !== undefined
            ? { newerHeld: decision.newerHeld }
            : {}),
        } as const;
      }

      if (exactRequest || latestIncompatibility !== null) {
        return yield* new SourceNotResolvable({
          category: "conflict",
          detail:
            latestIncompatibility ??
            `The official AXM skill release ${requested} is incompatible with this AXM CLI.`,
          recover:
            latestRecoveryTarget === null
              ? "Follow the compatibility recovery plan for the running CLI and official skill"
              : `Converge to ${latestRecoveryTarget}`,
          ...(latestRecoveryAction === null ? {} : { cmd: latestRecoveryAction }),
        });
      }
      return { kind: "not_found", target } as const;
    }

    const version = yield* entryForVersion(index, decision.version, target);
    const manifest = manifestForVersion(index, version);
    const ref = toExtensionRef(manifest, source);
    if (Option.isNone(ref)) {
      return yield* new SourceNotResolvable({
        category: "internal",
        detail: `Registry returned unsupported extension type for ${target}`,
      });
    }
    return decision.kind === "exempted"
      ? ({
          kind: "exempted",
          target,
          ref: ref.value,
          bypassed: decision.bypassed,
          exemption: decision.exemption,
        } as const)
      : ({
          kind: "selected",
          target,
          ref: ref.value,
          ...(decision.newerHeld === undefined ? {} : { newerHeld: decision.newerHeld }),
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
    ...(entry.deprecation === undefined ? {} : { deprecation: entry.deprecation }),
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
      return yield* new SourceNetworkFailure({
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
        return yield* new SourceNetworkFailure({
          detail: `Integrity mismatch for ${type}:${name}@${version}`,
        });
      }
    }

    const fs = yield* FileSystem.FileSystem;
    const tmpDir = yield* Effect.acquireRelease(
      fs.makeTempDirectory({ prefix: "axm-registry-package-" }).pipe(
        Effect.mapError(
          (e) =>
            new SourceNetworkFailure({
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
): RegistrySourceHostProvider<RegistryProviderRequirements> => ({
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
): RegistrySourceHostProvider<RegistryProviderRequirements> => ({
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
