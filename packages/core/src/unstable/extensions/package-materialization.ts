/**
 * Shared canonical package materialization helpers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import type { AppError, AppErrorCode } from "../app-error/index.js";
import { makeAppError } from "../app-error/index.js";
import type { Version, VersionRange } from "../version-constraints/version-constraints.js";
import { createRegistryClient, extractZip } from "../registry/index.js";
import { computeIntegrity, stripFileProtocol, writeFileAtomic } from "../utils/index.js";
import { protectWorkspacePath } from "../workspace/transaction.js";
import type { ExtensionName, ExtensionType } from "./common.js";
import type { Handle } from "./handle.js";
import { shouldReuseCanonicalInstall } from "./canonical-reuse.js";
import { copyExtensionDirectory, validatePathSafety } from "./utils.js";
import { CANONICAL_MATERIALIZATION_MARKER_FILENAME } from "./materialization-marker.js";

export interface RegistryCanonicalMaterializationIdentity {
  readonly refType: "registry";
  readonly owner: string;
  readonly type: ExtensionType;
  readonly name: string;
  readonly version: string;
  readonly publisherBindingId: string;
  readonly integrity: string | null;
}

export interface ExternalCanonicalMaterializationIdentity {
  readonly refType: "external";
  readonly sourceLocation: string;
}

export type CanonicalMaterializationIdentity =
  RegistryCanonicalMaterializationIdentity | ExternalCanonicalMaterializationIdentity;

export interface RegistryCanonicalMaterializationIdentityArgs {
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
  readonly version: Version | VersionRange;
  readonly publisherBindingId: string;
  readonly integrity: Option.Option<string>;
}

export const registryCanonicalMaterializationIdentity = (
  args: RegistryCanonicalMaterializationIdentityArgs,
): RegistryCanonicalMaterializationIdentity => ({
  refType: "registry",
  owner: args.owner,
  type: args.type,
  name: args.name,
  version: args.version,
  publisherBindingId: args.publisherBindingId,
  integrity: Option.getOrNull(args.integrity),
});

const RegistryCanonicalMaterializationIdentitySchema = Schema.Struct({
  refType: Schema.Literal("registry"),
  owner: Schema.String,
  type: Schema.Literals([
    "skill",
    "mcp-server",
    "subagent",
    "rule",
    "hook",
    "knowledge",
    "pack",
  ] as const),
  name: Schema.String,
  version: Schema.String,
  publisherBindingId: Schema.String,
  integrity: Schema.NullOr(Schema.String),
});

const ExternalCanonicalMaterializationIdentitySchema = Schema.Struct({
  refType: Schema.Literal("external"),
  sourceLocation: Schema.String,
});

const CanonicalMaterializationMarkerSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  identity: Schema.Union([
    RegistryCanonicalMaterializationIdentitySchema,
    ExternalCanonicalMaterializationIdentitySchema,
  ]),
});

type CanonicalMaterializationMarker = typeof CanonicalMaterializationMarkerSchema.Type;

const decodeCanonicalMaterializationMarker = Schema.decodeUnknownEffect(
  Schema.fromJsonString(CanonicalMaterializationMarkerSchema),
);

export const canonicalMaterializationPaths = (canonicalPath: string) => ({
  stagingPath: `${canonicalPath}.axm-staging`,
  backupPath: `${canonicalPath}.axm-backup`,
});

const markerPath = (root: string, path: Path.Path): string =>
  path.join(root, CANONICAL_MATERIALIZATION_MARKER_FILENAME);

const readCompletionMarker = (root: string, fs: FileSystem.FileSystem, path: Path.Path) =>
  fs
    .readFileString(markerPath(root, path))
    .pipe(Effect.flatMap(decodeCanonicalMaterializationMarker), Effect.option);

const identityMatches = (
  left: CanonicalMaterializationIdentity,
  right: CanonicalMaterializationIdentity,
): boolean => {
  if (left.refType !== right.refType) return false;
  if (left.refType === "external" || right.refType === "external") {
    return (
      left.refType === "external" &&
      right.refType === "external" &&
      left.sourceLocation === right.sourceLocation
    );
  }
  return (
    left.owner === right.owner &&
    left.type === right.type &&
    left.name === right.name &&
    left.version === right.version &&
    left.publisherBindingId === right.publisherBindingId &&
    left.integrity === right.integrity
  );
};

const writeCompletionMarker = (
  root: string,
  identity: CanonicalMaterializationIdentity,
  fs: FileSystem.FileSystem,
  path: Path.Path,
) => {
  const targetPath = markerPath(root, path);
  const marker: CanonicalMaterializationMarker = { schemaVersion: 1, identity };
  return fs.makeDirectory(root, { recursive: true }).pipe(
    Effect.mapError((cause) =>
      makeAppError({
        code: "internal",
        detail: `Failed to prepare canonical materialization marker at ${targetPath}`,
        cause,
      }),
    ),
    Effect.andThen(
      writeFileAtomic(fs, {
        targetPath,
        content: `${JSON.stringify(marker, null, 2)}\n`,
        mapError: ({ cause }) =>
          makeAppError({
            code: "internal",
            detail: `Failed to record canonical materialization completion at ${targetPath}`,
            cause,
          }),
      }),
    ),
  );
};

const recoverInterruptedReplacement = (
  canonicalPath: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
) =>
  Effect.gen(function* () {
    const { stagingPath, backupPath } = canonicalMaterializationPaths(canonicalPath);
    const canonicalExists = yield* fs.exists(canonicalPath);
    const backupExists = yield* fs.exists(backupPath);
    const canonicalComplete = canonicalExists
      ? Option.isSome(yield* readCompletionMarker(canonicalPath, fs, path))
      : false;

    if (backupExists && !canonicalComplete) {
      if (canonicalExists) {
        yield* fs.remove(canonicalPath, { recursive: true, force: true });
      }
      yield* fs.rename(backupPath, canonicalPath);
    } else if (backupExists) {
      yield* fs.remove(backupPath, { recursive: true, force: true });
    }
    yield* fs.remove(stagingPath, { recursive: true, force: true });
  }).pipe(
    Effect.mapError((cause) =>
      makeAppError({
        code: "internal",
        detail: `Failed to recover interrupted canonical materialization at ${canonicalPath}`,
        cause,
      }),
    ),
  );

export interface RecoverCanonicalDirectoryArgs {
  readonly baseDir: string;
  readonly canonicalPath: string;
}

/** Recover or clean sibling replacement state before any fallible source work. */
export const recoverCanonicalDirectory = (args: RecoverCanonicalDirectoryArgs) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { stagingPath, backupPath } = canonicalMaterializationPaths(args.canonicalPath);
    yield* validatePathSafety(path, args.baseDir, args.canonicalPath);
    yield* validatePathSafety(path, args.baseDir, stagingPath);
    yield* validatePathSafety(path, args.baseDir, backupPath);
    yield* recoverInterruptedReplacement(args.canonicalPath, fs, path);
  });

export interface ReplaceCanonicalDirectoryArgs<R> {
  readonly baseDir: string;
  readonly canonicalPath: string;
  readonly identity: CanonicalMaterializationIdentity;
  readonly populate: (stagingPath: string) => Effect.Effect<void, AppError, R>;
  readonly validate?: (stagingPath: string) => Effect.Effect<void, AppError, R>;
}

/**
 * Publish a complete canonical tree from a sibling staging directory. Recovery
 * restores a prior tree left in the sibling backup by abrupt process death;
 * incomplete staging is never made eligible for reuse.
 */
export const replaceCanonicalDirectory = <R>(
  args: ReplaceCanonicalDirectoryArgs<R>,
): Effect.Effect<string, AppError, FileSystem.FileSystem | Path.Path | R> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { stagingPath, backupPath } = canonicalMaterializationPaths(args.canonicalPath);

    yield* recoverCanonicalDirectory(args);
    yield* fs.makeDirectory(path.dirname(args.canonicalPath), { recursive: true }).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "internal",
          detail: `Failed to prepare canonical package parent for ${args.canonicalPath}`,
          cause,
        }),
      ),
    );

    const prepare = Effect.gen(function* () {
      yield* args.populate(stagingPath);
      if (args.validate !== undefined) yield* args.validate(stagingPath);
      yield* writeCompletionMarker(stagingPath, args.identity, fs, path);
    }).pipe(
      Effect.tapError(() =>
        fs.remove(stagingPath, { recursive: true, force: true }).pipe(Effect.ignore),
      ),
    );
    yield* prepare;

    yield* protectWorkspacePath(args.canonicalPath);
    const hadCanonical = yield* fs.exists(args.canonicalPath).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "internal",
          detail: `Failed to inspect canonical package at ${args.canonicalPath}`,
          cause,
        }),
      ),
    );
    yield* Effect.uninterruptible(
      Effect.gen(function* () {
        if (hadCanonical) yield* fs.rename(args.canonicalPath, backupPath);
        yield* fs
          .rename(stagingPath, args.canonicalPath)
          .pipe(
            Effect.tapError(() =>
              hadCanonical
                ? fs.rename(backupPath, args.canonicalPath).pipe(Effect.ignore)
                : Effect.void,
            ),
          );
        yield* fs.remove(backupPath, { recursive: true, force: true });
      }),
    ).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "internal",
          detail: `Failed to replace canonical package at ${args.canonicalPath}`,
          cause,
        }),
      ),
    );

    return args.canonicalPath;
  });

const registryLocationForClient = (location: URL): string =>
  location.protocol === "file:" ? location.pathname : location.href;

export interface RegistryPackageMaterializationMessages {
  readonly integrityMismatchDetail: string;
  readonly integrityMismatchCode: AppErrorCode;
}

export interface CanReuseInstalledPackageArgs {
  /**
   * Canonical installed tree for this extension. Always the workspace location
   * the extension is installed to — never a staging destination, whose absence
   * would make every install look like a first install.
   */
  readonly installedPath: string;
  /** Caller demanded an unconditional re-materialization. */
  readonly force: boolean;
  /** Immutable Registry identity requested by the ref being installed. */
  readonly identity: RegistryCanonicalMaterializationIdentity;
  /** Resolved version recorded in the current lockfile entry, when any. */
  readonly lockedVersion?: string;
  readonly existsFailureDetail: (installedPath: string) => string;
}

export interface CanReuseExternalPackageArgs {
  readonly installedPath: string;
  readonly force: boolean;
  readonly sourceLocation: string;
  readonly existsFailureDetail: (installedPath: string) => string;
}

/** Preserve a completed external canonical tree unless refresh was explicitly requested. */
export const canReuseExternalPackage = (args: CanReuseExternalPackageArgs) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* recoverInterruptedReplacement(args.installedPath, fs, path);
    const canonicalExists = yield* fs.exists(args.installedPath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: args.existsFailureDetail(args.installedPath),
          cause: error,
        }),
      ),
    );
    if (!canonicalExists || args.force) return false;
    const marker = yield* readCompletionMarker(args.installedPath, fs, path);
    return (
      Option.isSome(marker) &&
      identityMatches(marker.value.identity, {
        refType: "external",
        sourceLocation: args.sourceLocation,
      })
    );
  });

/**
 * Decide whether the installed tree already satisfies the requested ref, so no
 * archive needs to be fetched or written.
 *
 * Callers that stage into a temporary directory must call this against the
 * canonical installed path before staging: the decision is about the installed
 * tree, while `materializeRegistryPackage` only answers where bytes go.
 */
export const canReuseInstalledPackage = (args: CanReuseInstalledPackageArgs) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* recoverInterruptedReplacement(args.installedPath, fs, path);
    const canonicalExists = yield* fs.exists(args.installedPath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: args.existsFailureDetail(args.installedPath),
          cause: error,
        }),
      ),
    );
    const reusableByLock = shouldReuseCanonicalInstall({
      canonicalExists,
      force: args.force,
      hasIntegrity: args.identity.integrity !== null,
      refVersion: args.identity.version,
      lockedVersion: args.lockedVersion,
    });
    if (!reusableByLock) return false;
    const marker = yield* readCompletionMarker(args.installedPath, fs, path);
    return Option.isSome(marker) && identityMatches(marker.value.identity, args.identity);
  });

export interface MaterializeRegistryPackageArgs {
  readonly baseDir: string;
  /**
   * Directory that receives the extracted package bytes. Equals the canonical
   * installed path for in-place installs, and a staging directory for callers
   * that swap the tree into place after validating it.
   */
  readonly destinationPath: string;
  readonly sourceLocation: URL;
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
  readonly version: Version | VersionRange;
  readonly integrity: Option.Option<string>;
  readonly publisherBindingId: string;
  readonly messages: RegistryPackageMaterializationMessages;
  readonly validate?: (
    stagingPath: string,
  ) => Effect.Effect<void, AppError, FileSystem.FileSystem | Path.Path>;
}

/**
 * Fetch, verify, and extract a registry package into `destinationPath`.
 *
 * Always writes. Whether new bytes are needed at all is
 * `canReuseInstalledPackage`'s decision, which the caller makes against the
 * canonical installed path before choosing a destination.
 */
export const materializeRegistryPackage = (args: MaterializeRegistryPackageArgs) =>
  Effect.gen(function* () {
    yield* recoverCanonicalDirectory({
      baseDir: args.baseDir,
      canonicalPath: args.destinationPath,
    });
    const client = yield* createRegistryClient(registryLocationForClient(args.sourceLocation));
    const { archive } = yield* client.getExtensionPackage({
      owner: args.owner,
      type: args.type,
      name: args.name,
      version: Option.some(args.version),
    });

    if (Option.isSome(args.integrity)) {
      const actualIntegrity = yield* computeIntegrity(archive);
      if (actualIntegrity !== args.integrity.value) {
        return yield* makeAppError({
          code: args.messages.integrityMismatchCode,
          detail: args.messages.integrityMismatchDetail,
        });
      }
    }

    return yield* replaceCanonicalDirectory({
      baseDir: args.baseDir,
      canonicalPath: args.destinationPath,
      identity: registryCanonicalMaterializationIdentity({
        owner: args.owner,
        type: args.type,
        name: args.name,
        version: args.version,
        publisherBindingId: args.publisherBindingId,
        integrity: args.integrity,
      }),
      populate: (stagingPath) => extractZip(archive, stagingPath),
      ...(args.validate === undefined ? {} : { validate: args.validate }),
    });
  });

export interface MaterializeExternalPackageArgs {
  readonly baseDir: string;
  readonly canonicalPath: string;
  readonly sourceLocation: string;
  readonly copyFailureCode: AppErrorCode;
  readonly copyFailureDetail: (canonicalPath: string) => string;
  readonly validate?: (
    stagingPath: string,
  ) => Effect.Effect<void, AppError, FileSystem.FileSystem | Path.Path>;
}

export const materializeExternalPackage = (args: MaterializeExternalPackageArgs) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;

    yield* validatePathSafety(path, args.baseDir, args.canonicalPath);

    const sourcePath = stripFileProtocol(args.sourceLocation);
    const isSelfCopy = path.resolve(sourcePath) === path.resolve(args.canonicalPath);
    if (isSelfCopy) return args.canonicalPath;

    return yield* replaceCanonicalDirectory({
      baseDir: args.baseDir,
      canonicalPath: args.canonicalPath,
      identity: { refType: "external", sourceLocation: args.sourceLocation },
      populate: (stagingPath) =>
        copyExtensionDirectory(sourcePath, stagingPath).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: args.copyFailureCode,
              detail: args.copyFailureDetail(args.canonicalPath),
              cause: error,
            }),
          ),
        ),
      ...(args.validate === undefined ? {} : { validate: args.validate }),
    });
  });
