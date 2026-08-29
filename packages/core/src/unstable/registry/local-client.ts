/**
 * Local filesystem-backed registry client.
 *
 * All operations read/write files relative to a registry root using the
 * layout: `<root>/extensions/@<owner>/<type>/<name>/`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import { createHash } from "node:crypto";
import * as Array from "effect/Array";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

import {
  errPublishConflict,
  errRegistryPublishRejected,
  makeAppError,
  type AppError,
} from "../app-error/index.js";
import type {
  RegistryClient,
  RegistryExtensionManifest,
  GetExtensionPackageArgs,
  GetExtensionVisibilityArgs,
  PublishExtensionArgs,
  UpdateExtensionVisibilityArgs,
  ExtensionExistsArgs,
  GetExtensionsByOwnerResponse,
  PreviewExtensionPublishesArgs,
  DiscoverPackagesArgs,
  PublishPreviewResult,
} from "./client.js";
import {
  ExtensionFqnSchema,
  toAuthor,
  type Author,
  type ExtensionType,
  type ExtensionVisibility,
} from "../extensions/index.js";
import {
  isExtensionTypePlural,
  parseExtensionFqnParts,
  toExtensionTypePlural,
} from "../extensions/common.js";
import type { PackageExtensionDeclaration } from "../packaging/axm-package-meta.js";
import { writeFileAtomic } from "../utils/index.js";
import { packagesToPackageUrlParts, ExtensionIndexSchema, type ExtensionIndex } from "./schema.js";
import type { DiscoverPackagesResponse, DiscoveryExtensionResult } from "./discover-schema.js";
import { purlMatch } from "../packaging/purl-match.js";
import { PackageUrlSchema, type PackageUrlParts } from "../packaging/package-url.js";
import {
  extensionDir,
  extensionLifecycleWarnings,
  pluralizeType,
  resolveVersionEntry,
  selectVersion,
} from "./utils.js";
import type {
  PublishVisibility,
  VisibilityEvaluation,
  VisibilityFinding,
} from "../publish/index.js";
import {
  PUBLICATION_SET_CONTRACT,
  evaluateProspectivePackDependencyState,
  publicationDescriptorDigest,
  publicationSetDigest,
  validatePublicationDescriptors,
  validatePublicationSetResponse,
  type PublicationCandidateResult,
  type PublicationDescriptor,
  type ProspectivePublicationCandidate,
  type PublicationPackResult,
  type PublicationDependencySnapshot,
} from "./publication-set.js";

const decodeExtensionIndexFromJsonString = Schema.decodeUnknownEffect(
  Schema.fromJsonString(ExtensionIndexSchema),
);
const encodeExtensionIndexToJsonString = Schema.encodeSync(
  Schema.fromJsonString(ExtensionIndexSchema),
);
const encodePackageUrl = Schema.encodeSync(PackageUrlSchema);
const PUBLISH_LOCK_RETRY_DELAY = Duration.millis(25);
const PUBLISH_LOCK_STALE_TIMEOUT = Duration.minutes(5);
// eslint-disable-next-line no-restricted-syntax -- Process-owned keys are bounded by packages published during this one CLI invocation.
const publishLockSemaphores = new Map<string, Semaphore.Semaphore>();

const localVisibilityRevision = (index: ExtensionIndex): string =>
  `local-${createHash("sha256")
    .update(
      JSON.stringify({
        owner: index.owner,
        type: index.type,
        name: index.name,
        visibility: index.visibility ?? "public",
      }),
    )
    .digest("hex")}`;

type ResolvedVisibilityEvaluation = Omit<VisibilityEvaluation, "resolved"> & {
  readonly resolved: PublishVisibility;
};

const evaluateLocalPublishVisibility = (args: {
  readonly target: {
    readonly owner: string;
    readonly type: ExtensionType;
    readonly name: string;
  };
  readonly index: ExtensionIndex | undefined;
  readonly input: PublicationDescriptor["visibility"];
}): ResolvedVisibilityEvaluation => {
  const target = Schema.decodeUnknownSync(ExtensionFqnSchema)(
    `${args.target.owner}/${toExtensionTypePlural(args.target.type)}/${args.target.name}`,
  );
  const conflict: ReadonlyArray<VisibilityFinding> =
    args.input.intent !== null &&
    args.input.request !== null &&
    args.input.intent.value !== args.input.request
      ? [
          {
            code: "visibility/intent-conflict",
            severity: "error",
            message: `Requested visibility '${args.input.request}' conflicts with repository intent '${args.input.intent.value}'.`,
          },
        ]
      : [];
  if (args.index === undefined) {
    const resolved: PublishVisibility =
      args.input.intent !== null
        ? {
            value: args.input.intent.value,
            disposition: "establish",
            source: args.input.intent.source,
          }
        : args.input.request !== null
          ? { value: args.input.request, disposition: "establish", source: "explicit" }
          : { value: "public", disposition: "establish", source: "platform" };
    return {
      target,
      intent: args.input.intent,
      request: args.input.request,
      resolved,
      actual: null,
      comparison: "not-established",
      findings: conflict,
    };
  }

  const actual: ExtensionVisibility = args.index.visibility ?? "public";
  const drift: ReadonlyArray<VisibilityFinding> =
    args.input.intent !== null && args.input.intent.value !== actual
      ? [
          {
            code: "visibility/drift",
            severity: "error",
            message: `Repository intent '${args.input.intent.value}' does not match Registry visibility '${actual}'.`,
          },
        ]
      : [];
  return {
    target,
    intent: args.input.intent,
    request: args.input.request,
    resolved: { value: actual, disposition: "preserve", source: "existing" },
    actual: { value: actual, revision: localVisibilityRevision(args.index) },
    comparison:
      args.input.intent === null
        ? "unconfigured"
        : args.input.intent.value === actual
          ? "match"
          : "drift",
    findings: [...conflict, ...drift],
  };
};

const resolveLocalUploadVisibility = (
  index: ExtensionIndex | undefined,
  visibility: PublishVisibility | undefined,
): PublishVisibility =>
  index === undefined
    ? (visibility ?? { value: "public", disposition: "establish", source: "platform" })
    : { value: index.visibility ?? "public", disposition: "preserve", source: "existing" };

const makeLocalPublishCondition = (args: {
  readonly target: {
    readonly owner: string;
    readonly type: ExtensionType;
    readonly name: string;
    readonly version: string;
  };
  readonly visibility: PublishVisibility;
  readonly targetVersionExists: boolean;
}): string =>
  `"pv1-${createHash("sha256")
    .update(
      JSON.stringify({
        target: args.target,
        visibility: args.visibility,
        targetVersionExists: args.targetVersionExists,
      }),
    )
    .digest("hex")}"`;

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
          code: "internal",
          detail: `Failed to read index: ${idxPath}`,
          cause: e,
        }),
      ),
    );
    return yield* decodeExtensionIndexFromJsonString(content).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "internal",
          detail: `Invalid index schema: ${idxPath}`,
          cause: e,
        }),
      ),
    );
  });

const removeBestEffort = (fs: FileSystem.FileSystem, filePath: string) =>
  fs.remove(filePath).pipe(Effect.ignore);

const inProcessPublishSemaphoreFor = (lockPath: string): Semaphore.Semaphore => {
  const existing = publishLockSemaphores.get(lockPath);
  if (existing !== undefined) return existing;
  const created = Semaphore.makeUnsafe(1);
  publishLockSemaphores.set(lockPath, created);
  return created;
};

const acquirePublishLock = (
  fs: FileSystem.FileSystem,
  lockPath: string,
): Effect.Effect<void, AppError> =>
  Effect.gen(function* () {
    const acquiredAt = DateTime.formatIso(yield* DateTime.now);
    const result = yield* fs
      .writeFileString(lockPath, `${acquiredAt}\n`, { flag: "wx" })
      .pipe(Effect.result);
    if (result._tag === "Success") return;
    if (result.failure.reason._tag !== "AlreadyExists") {
      return yield* makeAppError({
        code: "internal",
        detail: `Failed to acquire local registry publish lock: ${lockPath}`,
        cause: result.failure,
      });
    }

    const info = yield* fs.stat(lockPath).pipe(Effect.option);
    const staleLock =
      Option.isSome(info) && Option.isSome(info.value.mtime)
        ? yield* DateTime.isPast(
            DateTime.addDuration(
              DateTime.makeUnsafe(info.value.mtime.value),
              PUBLISH_LOCK_STALE_TIMEOUT,
            ),
          )
        : false;
    if (staleLock) {
      yield* removeBestEffort(fs, lockPath);
    } else {
      yield* Effect.sleep(PUBLISH_LOCK_RETRY_DELAY);
    }
    return yield* acquirePublishLock(fs, lockPath);
  });

const withPublishLock = <A, E, R>(
  fs: FileSystem.FileSystem,
  lockPath: string,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | AppError, R> =>
  inProcessPublishSemaphoreFor(lockPath).withPermits(1)(
    Effect.scoped(
      Effect.gen(function* () {
        yield* Effect.acquireRelease(acquirePublishLock(fs, lockPath), () =>
          removeBestEffort(fs, lockPath),
        );
        return yield* effect;
      }),
    ),
  );

const indexToManifest = (
  index: ExtensionIndex,
  versionRange: Option.Option<string>,
): Option.Option<RegistryExtensionManifest> => {
  const selectedVersion = resolveVersionEntry(index.versions, versionRange);
  if (Option.isNone(selectedVersion)) return Option.none();

  const ver = selectedVersion.value;
  const lifecycleWarnings = extensionLifecycleWarnings(index, ver);
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
    dependencies: ver.dependencies ?? {},
    version: ver.version,
    integrity: ver.integrity,
    packages: packagesToPackageUrlParts(ver.packages),
    ...(index.deprecation === null ? {} : { deprecation: index.deprecation }),
    ...(lifecycleWarnings.length === 0 ? {} : { lifecycleWarnings }),
  } satisfies RegistryExtensionManifest);
};

/**
 * Process a single name directory within a registry owner/type directory.
 * Reads the index.json, validates it, and selects a matching version.
 * Returns Some(RegistryExtensionManifest) if a matching version is found, None otherwise.
 */
const processNameDir = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  typeDir: string,
  nameDir: string,
  versionRange: Option.Option<string>,
): Effect.Effect<Option.Option<RegistryExtensionManifest>, AppError> =>
  Effect.gen(function* () {
    const dir = path.join(typeDir, nameDir);
    const idxPath = path.join(dir, "index.json");
    const idxExists = yield* fs.exists(idxPath).pipe(Effect.orElseSucceed(() => false));
    if (!idxExists) return Option.none();

    const index = yield* readExtensionIndex(fs, idxPath);
    return indexToManifest(index, versionRange);
  });

const packageIdentity = (parts: PackageUrlParts): PackageUrlParts => ({
  type: parts.type,
  name: parts.name,
  ...(parts.namespace === undefined ? {} : { namespace: parts.namespace }),
  ...(parts.qualifiers === undefined ? {} : { qualifiers: parts.qualifiers }),
  ...(parts.subpath === undefined ? {} : { subpath: parts.subpath }),
});

const extensionDeclarationToDiscoveryRef = (value: PackageExtensionDeclaration) => {
  const parts = parseExtensionFqnParts(value.ref);
  if (parts === undefined) {
    return undefined;
  }

  return {
    ref: `${parts.owner}/${toExtensionTypePlural(parts.type)}/${parts.name}`,
    ...(value.versionRange === undefined || value.versionRange === null
      ? {}
      : { versionRange: value.versionRange }),
  };
};

const indexToExtensionResult = (
  index: ExtensionIndex,
  attestedBy: ReadonlyArray<"package" | "extension">,
  official: boolean,
): DiscoveryExtensionResult | undefined => {
  const [latestVersion] = index.versions;
  if (latestVersion === undefined) {
    return undefined;
  }

  return {
    ref: `${index.owner}/${toExtensionTypePlural(index.type)}/${index.name}`,
    resolved: true,
    extension: {
      type: index.type,
      name: index.name,
      owner: index.owner,
      installVersion: latestVersion.version,
    },
    attestedBy,
    official,
    packageVersionInRange: true,
  };
};

/** Parse an extension FQN string into owner/type/name parts. */
const parseRef = (ref: string): { owner: string; type: ExtensionType; name: string } | undefined =>
  parseExtensionFqnParts(ref);

/**
 * Scan all extensions under the extensions root directory.
 * Returns an array of ExtensionIndex entries.
 */
const scanAllExtensions = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  extensionsRoot: string,
): Effect.Effect<ReadonlyArray<ExtensionIndex>, AppError> =>
  Effect.gen(function* () {
    const ownerDirs = yield* fs
      .readDirectory(extensionsRoot)
      .pipe(Effect.orElseSucceed((): readonly string[] => []));

    // Cap concurrency at each nesting level to bound resource usage on large registries.
    const nestedResults = yield* Effect.forEach(
      ownerDirs.filter((d) => d.startsWith("@")),
      (ownerDir) =>
        Effect.gen(function* () {
          const ownerPath = path.join(extensionsRoot, ownerDir);
          const typeDirs = yield* fs
            .readDirectory(ownerPath)
            .pipe(Effect.orElseSucceed((): readonly string[] => []));

          const typeResults = yield* Effect.forEach(
            typeDirs.filter((d) => isExtensionTypePlural(d)),
            (typeDir) =>
              Effect.gen(function* () {
                const typePath = path.join(ownerPath, typeDir);
                const nameDirs = yield* fs
                  .readDirectory(typePath)
                  .pipe(Effect.orElseSucceed((): readonly string[] => []));

                return yield* Effect.forEach(
                  nameDirs,
                  (nameDir) =>
                    Effect.gen(function* () {
                      const idxPath = path.join(typePath, nameDir, "index.json");
                      const exists = yield* fs
                        .exists(idxPath)
                        .pipe(Effect.orElseSucceed(() => false));
                      if (!exists) return Option.none<ExtensionIndex>();

                      const index = yield* readExtensionIndex(fs, idxPath);
                      if (index.versions.length === 0) return Option.none<ExtensionIndex>();
                      return Option.some(index);
                    }),
                  { concurrency: 20 },
                ).pipe(Effect.map(Array.getSomes));
              }),
            { concurrency: 20 },
          );

          return Array.flatten(typeResults);
        }),
      { concurrency: 20 },
    );

    return Array.flatten(nestedResults);
  });

// -----------------------------------------------------------------------------
// Local Registry Client
// -----------------------------------------------------------------------------

/**
 * Creates a local filesystem-backed registry client.
 *
 * All operations read/write files relative to `registryRoot` using the
 * registry layout: `<root>/extensions/@<owner>/<type>/<name>/`.
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
  previewExtensionPublishes: (args: PreviewExtensionPublishesArgs) =>
    Effect.gen(function* () {
      const descriptors = yield* Effect.try({
        try: () => validatePublicationDescriptors(args.candidates),
        catch: (cause) =>
          makeAppError({
            code: "validation",
            detail: "The publication set is invalid.",
            cause,
          }),
      });
      const candidates = yield* Effect.forEach(
        descriptors,
        (descriptor): Effect.Effect<PublicationCandidateResult, AppError> => {
          const target = descriptor.target;
          const indexPath = path.join(
            extensionDir(registryRoot, target.owner, target.type, target.name, path.join),
            "index.json",
          );
          return Effect.gen(function* () {
            const exists = yield* fs.exists(indexPath).pipe(Effect.orElseSucceed(() => false));
            const index = exists ? yield* readExtensionIndex(fs, indexPath) : undefined;
            const visibility = evaluateLocalPublishVisibility({
              target,
              index,
              input: descriptor.visibility,
            });
            return {
              kind: "resolved",
              target,
              participation: descriptor.participation,
              descriptorDigest: publicationDescriptorDigest(descriptor),
              visibility,
              ...(descriptor.participation === "verified-existing"
                ? {}
                : {
                    condition: makeLocalPublishCondition({
                      target,
                      visibility: visibility.resolved,
                      targetVersionExists:
                        index?.versions.some((entry) => entry.version === target.version) ?? false,
                    }),
                  }),
            } satisfies PublicationCandidateResult;
          });
        },
      );
      const candidateByTarget = new Map(
        candidates.map((candidate) => [
          `${candidate.target.owner}\u0000${candidate.target.type}\u0000${candidate.target.name}`,
          candidate,
        ]),
      );
      const packDescriptors = descriptors.filter(
        (descriptor) => descriptor.target.type === "pack" && descriptor.participation === "publish",
      );
      const dependencyDescriptors = packDescriptors.flatMap(
        (descriptor) => descriptor.pack?.dependencies ?? [],
      );
      const snapshots = yield* Effect.forEach(
        dependencyDescriptors,
        (dependency): Effect.Effect<PublicationDependencySnapshot, AppError> =>
          Effect.gen(function* () {
            const indexPath = path.join(
              extensionDir(
                registryRoot,
                dependency.owner,
                dependency.type,
                dependency.name,
                path.join,
              ),
              "index.json",
            );
            const exists = yield* fs.exists(indexPath).pipe(Effect.orElseSucceed(() => false));
            const index = exists ? yield* readExtensionIndex(fs, indexPath) : undefined;
            return {
              dependency,
              exists: index !== undefined,
              visibility: index?.visibility ?? (index === undefined ? null : "public"),
              lifecycleState: index === undefined ? null : "active",
              deprecation: index?.deprecation ?? null,
              versions:
                index?.versions.map((version) => ({
                  version: version.version,
                  status: "available",
                  yanked: false,
                  purged: false,
                })) ?? [],
            };
          }),
      );
      const prospectiveCandidates: ReadonlyArray<ProspectivePublicationCandidate> = descriptors.map(
        (descriptor) => {
          const result = candidateByTarget.get(
            `${descriptor.target.owner}\u0000${descriptor.target.type}\u0000${descriptor.target.name}`,
          );
          if (result?.kind === "resolved") {
            return { descriptor, kind: "resolved", visibility: result.visibility };
          }
          return {
            descriptor,
            kind: "unavailable",
            visibility: {
              target: Schema.decodeUnknownSync(ExtensionFqnSchema)(
                `${descriptor.target.owner}/${toExtensionTypePlural(descriptor.target.type)}/${descriptor.target.name}`,
              ),
              unavailable: true,
              findings: [
                {
                  code: "visibility/unavailable",
                  severity: "error",
                  message: "The visibility target is unavailable.",
                },
              ],
            },
          };
        },
      );
      const packs: ReadonlyArray<PublicationPackResult> = packDescriptors.map((descriptor) => {
        const packCandidate = candidateByTarget.get(
          `${descriptor.target.owner}\u0000${descriptor.target.type}\u0000${descriptor.target.name}`,
        );
        const evaluated = evaluateProspectivePackDependencyState({
          packVisibility:
            packCandidate?.kind === "resolved" && packCandidate.visibility.resolved !== null
              ? packCandidate.visibility.resolved.value
              : "public",
          dependencies: descriptor.pack?.dependencies ?? [],
          snapshots,
          candidates: prospectiveCandidates,
        });
        const blocked = evaluated.findings.some((finding) => finding.severity === "error");
        return {
          target: descriptor.target,
          status: blocked ? "blocked" : "admitted",
          findings: evaluated.findings,
          resolutions: blocked ? [] : evaluated.resolutions,
        };
      });
      const status =
        candidates.some((candidate) =>
          candidate.visibility.findings.some((finding) => finding.severity === "error"),
        ) || packs.some((pack) => pack.status === "blocked")
          ? "blocked"
          : "admitted";
      const boundCandidates = candidates.map((candidate) =>
        status === "blocked" && candidate.kind === "resolved"
          ? {
              kind: candidate.kind,
              target: candidate.target,
              participation: candidate.participation,
              descriptorDigest: candidate.descriptorDigest,
              visibility: candidate.visibility,
            }
          : candidate,
      );
      return validatePublicationSetResponse(descriptors, {
        contract: PUBLICATION_SET_CONTRACT,
        publicationSetDigest: publicationSetDigest(descriptors),
        status,
        candidates: boundCandidates,
        packs,
      } satisfies PublishPreviewResult);
    }),
  getExtensionsByScope: (args) =>
    Effect.gen(function* () {
      if (args.owner === "*") {
        const extensionsDir = path.join(registryRoot, "extensions");
        const indexes = yield* scanAllExtensions(fs, path, extensionsDir);
        const manifests = Array.getSomes(
          indexes
            .filter((index) => args.types.length === 0 || args.types.includes(index.type))
            .filter((index) => args.names.length === 0 || args.names.includes(index.name))
            .map((index) => indexToManifest(index, Option.none())),
        );
        const total = manifests.length;
        const sliced = manifests.slice(args.offset);
        const extensions = Option.match(args.limit, {
          onNone: () => sliced,
          onSome: (l) => sliced.slice(0, l),
        });
        return {
          extensions,
          total,
        } satisfies GetExtensionsByOwnerResponse;
      }

      const findForName = (name: string) =>
        Effect.gen(function* () {
          const requestedTypes: ReadonlyArray<ExtensionType> =
            args.types.length === 0 ? ["skill", "mcp-server", "pack"] : args.types;

          const extensionsDir = path.join(registryRoot, "extensions");

          const nestedResults = yield* Effect.forEach(
            requestedTypes,
            (extType) =>
              Effect.gen(function* () {
                const typeDir = path.join(extensionsDir, args.owner, pluralizeType(extType));
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
      } satisfies GetExtensionsByOwnerResponse;
    }),

  ownerExists: (owner) =>
    Effect.gen(function* () {
      const scopeDir = path.join(registryRoot, "extensions", owner);
      const exists = yield* fs.exists(scopeDir).pipe(Effect.orElseSucceed(() => false));
      return { exists };
    }),

  getExtensionIndex: (args) =>
    Effect.gen(function* () {
      const dir = extensionDir(registryRoot, args.owner, args.type, args.name, path.join);
      const idxPath = path.join(dir, "index.json");
      const exists = yield* fs.exists(idxPath).pipe(Effect.orElseSucceed(() => false));
      if (!exists) {
        return Option.none<ExtensionIndex>();
      }

      return Option.some(yield* readExtensionIndex(fs, idxPath));
    }),

  getExactExtensionVersion: (args) =>
    Effect.gen(function* () {
      const dir = extensionDir(registryRoot, args.owner, args.type, args.name, path.join);
      const idxPath = path.join(dir, "index.json");
      const exists = yield* fs.exists(idxPath).pipe(Effect.orElseSucceed(() => false));
      if (!exists) return Option.none();
      const index = yield* readExtensionIndex(fs, idxPath);
      const version = index.versions.find((entry) => entry.version === args.version);
      return version === undefined
        ? Option.none()
        : Option.some({
            owner: args.owner,
            type: args.type,
            name: args.name,
            version: args.version,
            integrity: version.integrity,
            status: "available" as const,
          });
    }),

  getExtensionPackage: (args: GetExtensionPackageArgs) =>
    Effect.gen(function* () {
      const owner = args.owner;
      const dir = extensionDir(registryRoot, owner, args.type, args.name, path.join);

      const version = yield* Option.match(args.version, {
        onNone: () =>
          Effect.gen(function* () {
            const idxPath = path.join(dir, "index.json");
            const index = yield* readExtensionIndex(fs, idxPath);

            const selected = selectVersion(index.versions);
            if (Option.isNone(selected)) {
              return yield* makeAppError({
                code: "internal",
                detail: `No versions found for ${owner}/${args.type}/${args.name}`,
              });
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
              return yield* makeAppError({
                code: "internal",
                detail: `No version matched constraint "${requestedVersion}" for ${owner}/${args.type}/${args.name}`,
              });
            }
            return selected.value.version;
          }),
      });

      const archivePath = path.join(dir, `${version}.zip`);

      const exists = yield* fs.exists(archivePath).pipe(Effect.orElseSucceed(() => false));
      if (!exists) {
        return yield* makeAppError({
          code: "internal",
          detail: `Archive not found: ${archivePath}`,
        });
      }

      const archive = yield* fs.readFile(archivePath).pipe(
        Effect.mapError((e) =>
          makeAppError({
            code: "internal",
            detail: `Failed to read archive: ${archivePath}`,
            cause: e,
          }),
        ),
      );
      return { archive };
    }),

  publishExtension: (args: PublishExtensionArgs) =>
    Effect.gen(function* () {
      const owner = args.owner;
      const dir = extensionDir(registryRoot, owner, args.type, args.name, path.join);

      // Ensure directory exists
      yield* fs.makeDirectory(dir, { recursive: true }).pipe(
        Effect.mapError((e) =>
          errRegistryPublishRejected({
            message: `Registry directory could not be created: ${dir}`,
            cause: e,
          }),
        ),
      );

      const indexPath = path.join(dir, "index.json");
      const archivePath = path.join(dir, `${args.version}.zip`);
      const lockPath = path.join(dir, ".publish.lock");

      return yield* withPublishLock(
        fs,
        lockPath,
        Effect.gen(function* () {
          const indexExists = yield* fs.exists(indexPath).pipe(Effect.orElseSucceed(() => false));
          const currentIndex = indexExists
            ? yield* fs.readFileString(indexPath).pipe(
                Effect.flatMap(decodeExtensionIndexFromJsonString),
                Effect.mapError((cause) =>
                  makeAppError({
                    code: "internal",
                    detail: "Registry index schema is invalid",
                    cause,
                  }),
                ),
              )
            : undefined;
          const resolvedVisibility = resolveLocalUploadVisibility(currentIndex, args.visibility);
          if (args.condition !== undefined) {
            const currentCondition = makeLocalPublishCondition({
              target: {
                owner: args.owner,
                type: args.type,
                name: args.name,
                version: args.version,
              },
              visibility: resolvedVisibility,
              targetVersionExists:
                currentIndex?.versions.some((entry) => entry.version === args.version) ?? false,
            });
            if (args.condition !== currentCondition) {
              return yield* makeAppError({
                code: "conflict",
                detail: "Publish precondition changed; preview again before publishing.",
              });
            }
          }
          const nextIndex = indexExists
            ? yield* Effect.gen(function* () {
                if (currentIndex === undefined) {
                  return yield* makeAppError({
                    code: "internal",
                    detail: "Registry index disappeared during publication.",
                  });
                }
                if (args.condition === undefined && args.visibility !== undefined) {
                  return yield* makeAppError({
                    code: "conflict",
                    detail: "Initial visibility is only valid when creating an extension.",
                  });
                }
                if (currentIndex.versions.some((version) => version.version === args.version)) {
                  return yield* errPublishConflict({ version: args.version });
                }
                return {
                  ...currentIndex,
                  versions: [args.metadata, ...currentIndex.versions],
                } satisfies ExtensionIndex;
              })
            : ({
                name: args.name,
                owner,
                type: args.type,
                publisherBindingId: `hbnd_local_${globalThis.crypto.randomUUID()}`,
                visibility: resolvedVisibility.value,
                deprecation: null,
                versions: [args.metadata],
              } satisfies ExtensionIndex);

          yield* writeFileAtomic(fs, {
            targetPath: archivePath,
            content: args.archive,
            removeTargetBeforeRename: true,
            mapError: (failure) =>
              failure.step === "rename"
                ? errRegistryPublishRejected({
                    message: `Registry archive could not be committed: ${archivePath}`,
                    cause: failure.cause,
                  })
                : errRegistryPublishRejected({
                    message: `Registry archive temp file could not be written: ${failure.tempPath}`,
                    cause: failure.cause,
                  }),
          });

          yield* writeFileAtomic(fs, {
            targetPath: indexPath,
            content: `${encodeExtensionIndexToJsonString(nextIndex)}\n`,
            mapError: (failure) =>
              failure.step === "rename"
                ? errRegistryPublishRejected({
                    message: `Registry index could not be committed: ${indexPath}`,
                    cause: failure.cause,
                  })
                : errRegistryPublishRejected({
                    message: `Registry index temp file could not be written: ${failure.tempPath}`,
                    cause: failure.cause,
                  }),
          });

          return {
            published: true,
            owner: args.owner,
            type: args.type,
            name: args.name,
            version: args.version,
            integrity: args.metadata.integrity,
            status: "available",
            visibility: resolvedVisibility,
            warnings: [],
          } as const;
        }),
      );
    }),

  getExtensionVisibility: (args: GetExtensionVisibilityArgs) =>
    Effect.gen(function* () {
      const dir = extensionDir(registryRoot, args.owner, args.type, args.name, path.join);
      const index = yield* readExtensionIndex(fs, path.join(dir, "index.json"));
      return evaluateLocalPublishVisibility({
        target: { owner: args.owner, type: args.type, name: args.name },
        index,
        input: { intent: args.intent, request: null },
      });
    }),

  updateExtensionVisibility: (args: UpdateExtensionVisibilityArgs) =>
    Effect.gen(function* () {
      const target = parseExtensionFqnParts(args.target);
      if (target === undefined) {
        return yield* makeAppError({
          code: "validation",
          detail: `Invalid extension target: ${args.target}`,
        });
      }
      const dir = extensionDir(registryRoot, target.owner, target.type, target.name, path.join);
      const indexPath = path.join(dir, "index.json");
      const content = yield* fs.readFileString(indexPath).pipe(
        Effect.mapError((cause) =>
          makeAppError({
            code: "not_found",
            detail: `Extension index not found: ${indexPath}`,
            cause,
          }),
        ),
      );
      const index = yield* decodeExtensionIndexFromJsonString(content).pipe(
        Effect.mapError((cause) =>
          makeAppError({ code: "validation", detail: "Registry index schema is invalid", cause }),
        ),
      );
      const revision = localVisibilityRevision(index);
      if (revision !== args.revision) {
        return yield* makeAppError({
          code: "conflict",
          detail: "Extension visibility changed; read the current revision and retry.",
        });
      }
      const before = index.visibility ?? "public";
      if (before === args.visibility) {
        return {
          target: args.target,
          before,
          after: before,
          authority: args.authority,
          result: "already-satisfied",
          revision,
        };
      }
      yield* fs
        .writeFileString(
          indexPath,
          `${encodeExtensionIndexToJsonString({ ...index, visibility: args.visibility })}\n`,
        )
        .pipe(
          Effect.mapError((cause) =>
            makeAppError({
              code: "internal",
              detail: `Registry index could not be written: ${indexPath}`,
              cause,
            }),
          ),
        );
      const updated = { ...index, visibility: args.visibility };
      return {
        target: args.target,
        before,
        after: args.visibility,
        authority: args.authority,
        result: "changed",
        revision: localVisibilityRevision(updated),
      };
    }),

  extensionExists: (args: ExtensionExistsArgs) =>
    Effect.gen(function* () {
      const owner = args.owner;
      const dir = extensionDir(registryRoot, owner, args.type, args.name, path.join);
      const indexPath = path.join(dir, "index.json");
      const exists = yield* fs.exists(indexPath).pipe(Effect.orElseSucceed(() => false));
      return { exists };
    }),

  discoverPackages: (args: DiscoverPackagesArgs) =>
    Effect.gen(function* () {
      const extensionsRoot = path.join(registryRoot, "extensions");
      const rootExists = yield* fs.exists(extensionsRoot).pipe(Effect.orElseSucceed(() => false));
      if (!rootExists) {
        return { results: [] } satisfies DiscoverPackagesResponse;
      }

      // Scan all extensions and read their index.json
      const allExtensions = yield* scanAllExtensions(fs, path, extensionsRoot);

      const results = args.packages.map((pkg) => {
        const purl = encodePackageUrl(packageIdentity(pkg.purl));
        const entries = new Map<string, DiscoveryExtensionResult>();

        for (const spec of pkg.declaredExtensions) {
          const declared = extensionDeclarationToDiscoveryRef(spec);
          if (declared === undefined) {
            continue;
          }
          const parsed = parseRef(spec.ref);
          const match =
            parsed === undefined
              ? undefined
              : allExtensions.find(
                  (ext) =>
                    ext.owner === parsed.owner &&
                    ext.type === parsed.type &&
                    ext.name === parsed.name,
                );
          const resolved =
            match === undefined
              ? ({
                  ref: declared.ref,
                  resolved: false,
                  attestedBy: ["package"],
                  official: false,
                  packageVersionInRange: true,
                } satisfies DiscoveryExtensionResult)
              : indexToExtensionResult(match, ["package"], false);
          if (resolved !== undefined) {
            entries.set(declared.ref, resolved);
          }
        }

        for (const ext of allExtensions) {
          const latestVersion = ext.versions[0];
          if (latestVersion === undefined) {
            continue;
          }
          const matchesPackage = packagesToPackageUrlParts(latestVersion.packages).some(
            (declared) => purlMatch(pkg.purl, declared),
          );
          if (!matchesPackage) {
            continue;
          }

          const ref = `${ext.owner}/${toExtensionTypePlural(ext.type)}/${ext.name}`;
          const existing = entries.get(ref);
          const next = indexToExtensionResult(
            ext,
            existing === undefined ? ["extension"] : ["package", "extension"],
            existing !== undefined,
          );
          if (next !== undefined) {
            entries.set(ref, next);
          }
        }

        return {
          purl,
          version: pkg.version,
          status: "resolved" as const,
          extensions: [...entries.values()],
        };
      });

      return { results } satisfies DiscoverPackagesResponse;
    }),
});
