/**
 * Shared canonical package materialization helpers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as HttpClient from "effect/unstable/http/HttpClient";
import type { AppError, AppErrorCode } from "../app-error/index.js";
import { makeAppError } from "../app-error/index.js";
import type { Version, VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import { createRegistryClient, extractZip } from "../registry/index.js";
import { computeIntegrity, stripFileProtocol } from "../utils/index.js";
import { protectCreatedAncestors, protectWorkspacePath } from "../workspace/transaction.js";
import { recordFootprint } from "../workspace/footprint-recorder.js";
import type {
  ExtensionName,
  ExtensionType,
} from "@agentxm/extension-model/unstable/extensions/common";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import { shouldReuseCanonicalInstall } from "./canonical-reuse.js";
import { copyExtensionDirectory, validatePathSafety } from "./utils.js";
import {
  computeMaterializedTreeIntegrity,
  type TreeIntegrity,
} from "../workspace/materialized-tree.js";

export const canonicalMaterializationPaths = (canonicalPath: string) => ({
  stagingPath: `${canonicalPath}.axm-staging`,
  backupPath: `${canonicalPath}.axm-backup`,
});

/**
 * Resolve the sibling replacement state left by an interrupted swap.
 *
 * `replaceCanonicalDirectory` never populates the canonical path in place: it
 * fills a sibling staging directory, then commits with two same-parent renames.
 * So the canonical path only ever holds a whole tree, and the pair of
 * (canonical present, backup present) names the interruption point exactly:
 *
 * - backup, no canonical — died between the two renames; restore the backup.
 * - backup and canonical — the second rename landed; the backup is superseded.
 * - no backup — nothing was swapped; only staging needs discarding.
 */
const recoverInterruptedReplacement = (canonicalPath: string, fs: FileSystem.FileSystem) =>
  Effect.gen(function* () {
    const { stagingPath, backupPath } = canonicalMaterializationPaths(canonicalPath);
    const canonicalExists = yield* fs.exists(canonicalPath);
    const backupExists = yield* fs.exists(backupPath);

    if (backupExists && !canonicalExists) {
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
    yield* recoverInterruptedReplacement(args.canonicalPath, fs);
  });

export interface ReplaceCanonicalDirectoryArgs<R> {
  readonly baseDir: string;
  readonly canonicalPath: string;
  readonly populate: (stagingPath: string) => Effect.Effect<void, AppError, R>;
  readonly validate?: (stagingPath: string) => Effect.Effect<void, AppError, R>;
}

export interface ReplaceCanonicalDirectoryWithInspectionArgs<
  A,
  R,
> extends ReplaceCanonicalDirectoryArgs<R> {
  readonly inspect: (stagingPath: string) => Effect.Effect<A, AppError, R>;
}

export interface CanonicalDirectoryInspection<A> {
  readonly canonicalPath: string;
  readonly inspection: A;
}

export interface CreateCanonicalDirectoryArgs<R> extends ReplaceCanonicalDirectoryArgs<R> {
  /** Human-readable create-only subject used in collision diagnostics. */
  readonly subject: string;
  /** Type-defined files that must exist in the complete staged package. */
  readonly requiredFiles?: ReadonlyArray<string>;
}

const validateRequiredPackageFiles = (stagingPath: string, requiredFiles: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* Effect.forEach(
      requiredFiles,
      (relativePath) =>
        Effect.gen(function* () {
          const filePath = path.join(stagingPath, relativePath);
          yield* validatePathSafety(path, stagingPath, filePath);
          const info = yield* fs.stat(filePath).pipe(
            Effect.mapError((cause) =>
              makeAppError({
                code: "validation",
                detail: `Staged package is missing required file: ${relativePath}`,
                cause,
              }),
            ),
          );
          if (info.type !== "File") {
            return yield* makeAppError({
              code: "validation",
              detail: `Staged package path is not a file: ${relativePath}`,
            });
          }
        }),
      { discard: true },
    );
  });

/**
 * Publish a complete canonical tree from a sibling staging directory. Recovery
 * restores a prior tree left in the sibling backup by abrupt process death;
 * incomplete staging is never made eligible for reuse.
 */
export const replaceCanonicalDirectoryWithInspection = <A, R>(
  args: ReplaceCanonicalDirectoryWithInspectionArgs<A, R>,
): Effect.Effect<
  CanonicalDirectoryInspection<A>,
  AppError,
  FileSystem.FileSystem | Path.Path | R
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { stagingPath, backupPath } = canonicalMaterializationPaths(args.canonicalPath);

    yield* recoverCanonicalDirectory(args);
    yield* protectCreatedAncestors(fs, path, path.dirname(args.canonicalPath));
    yield* fs.makeDirectory(path.dirname(args.canonicalPath), { recursive: true }).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "internal",
          detail: `Failed to prepare canonical package parent for ${args.canonicalPath}`,
          cause,
        }),
      ),
    );

    const inspection = yield* Effect.gen(function* () {
      yield* fs.makeDirectory(stagingPath, { recursive: true }).pipe(
        Effect.mapError((cause) =>
          makeAppError({
            code: "internal",
            detail: `Failed to prepare canonical package staging at ${stagingPath}`,
            cause,
          }),
        ),
      );
      yield* args.populate(stagingPath);
      if (args.validate !== undefined) yield* args.validate(stagingPath);
      return yield* args.inspect(stagingPath);
    }).pipe(
      Effect.tapError(() =>
        fs.remove(stagingPath, { recursive: true, force: true }).pipe(Effect.ignore),
      ),
    );
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
    yield* recordFootprint({
      path: args.canonicalPath,
      change: hadCanonical ? "modified" : "created",
    });

    return { canonicalPath: args.canonicalPath, inspection };
  });

export const replaceCanonicalDirectory = <R>(
  args: ReplaceCanonicalDirectoryArgs<R>,
): Effect.Effect<string, AppError, FileSystem.FileSystem | Path.Path | R> =>
  replaceCanonicalDirectoryWithInspection({
    ...args,
    inspect: () => Effect.void,
  }).pipe(Effect.map(({ canonicalPath }) => canonicalPath));

/**
 * Publish one create-only authored package without ever populating its
 * canonical directory in place. Interrupted sibling state is resolved before
 * the collision check while the caller holds the workspace mutation lock.
 */
export const createCanonicalDirectory = <R>(
  args: CreateCanonicalDirectoryArgs<R>,
): Effect.Effect<string, AppError, FileSystem.FileSystem | Path.Path | R> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* recoverCanonicalDirectory(args);
    const exists = yield* fs.exists(args.canonicalPath).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "internal",
          detail: `Failed to inspect create-only destination: ${args.canonicalPath}`,
          cause,
        }),
      ),
    );
    if (exists) {
      return yield* makeAppError({
        code: "conflict",
        detail: `${args.subject} destination already exists: ${args.canonicalPath}`,
        recover: "Choose a different name or remove the existing directory first",
      });
    }

    return yield* replaceCanonicalDirectory({
      baseDir: args.baseDir,
      canonicalPath: args.canonicalPath,
      populate: args.populate,
      validate: (stagingPath) =>
        validateRequiredPackageFiles(stagingPath, args.requiredFiles ?? []).pipe(
          Effect.andThen(args.validate === undefined ? Effect.void : args.validate(stagingPath)),
        ),
    });
  });

const registryLocationForClient = (location: URL): string =>
  location.protocol === "file:" ? location.pathname : location.href;

export interface RegistryPackageMaterializationMessages {
  readonly integrityMismatchDetail: string;
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
  /** Exact version requested by the ref being installed. */
  readonly refVersion: string;
  /** The ref carries a pinned archive integrity (registry-resolved). */
  readonly hasIntegrity: boolean;
  /** Resolved version recorded in the current lockfile entry, when any. */
  readonly lockedVersion?: string;
  readonly existsFailureDetail: (installedPath: string) => string;
}

export interface CanReuseExternalPackageArgs {
  readonly installedPath: string;
  readonly force: boolean;
  readonly existsFailureDetail: (installedPath: string) => string;
}

/** Preserve an existing external canonical tree unless refresh was explicitly requested. */
export const canReuseExternalPackage = (args: CanReuseExternalPackageArgs) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* recoverInterruptedReplacement(args.installedPath, fs);
    const canonicalExists = yield* fs.exists(args.installedPath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: args.existsFailureDetail(args.installedPath),
          cause: error,
        }),
      ),
    );
    return canonicalExists && !args.force;
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
    yield* recoverInterruptedReplacement(args.installedPath, fs);
    const canonicalExists = yield* fs.exists(args.installedPath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: args.existsFailureDetail(args.installedPath),
          cause: error,
        }),
      ),
    );
    return shouldReuseCanonicalInstall({
      canonicalExists,
      force: args.force,
      hasIntegrity: args.hasIntegrity,
      refVersion: args.refVersion,
      lockedVersion: args.lockedVersion,
    });
  });

export interface MaterializeRegistryPackageArgs {
  readonly baseDir: string;
  /**
   * Canonical installed path for this extension. Bytes always land in a sibling
   * staging directory first and are swapped in after validation.
   */
  readonly destinationPath: string;
  readonly sourceLocation: URL;
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
  readonly version: Version | VersionRange;
  readonly integrity: Option.Option<string>;
  readonly messages: RegistryPackageMaterializationMessages;
  readonly validate?: (
    stagingPath: string,
  ) => Effect.Effect<void, AppError, FileSystem.FileSystem | Path.Path>;
}

export interface MaterializedPackage {
  readonly canonicalPath: string;
  readonly treeIntegrity: TreeIntegrity;
}

/**
 * Fetch, verify, and extract a registry package into `destinationPath`.
 *
 * Always writes. Whether new bytes are needed at all is
 * `canReuseInstalledPackage`'s decision, which the caller makes against the
 * canonical installed path before choosing a destination.
 */
export const materializeRegistryPackageWithTreeIntegrity = (
  args: MaterializeRegistryPackageArgs,
): Effect.Effect<
  MaterializedPackage,
  AppError,
  FileSystem.FileSystem | HttpClient.HttpClient | Path.Path
> =>
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
          code: "validation",
          detail: `${args.messages.integrityMismatchDetail} — the fetched archive does not match the accepted integrity. Verify the source and rerun, or update to accept a republished version.`,
        });
      }
    }

    const result = yield* replaceCanonicalDirectoryWithInspection({
      baseDir: args.baseDir,
      canonicalPath: args.destinationPath,
      populate: (stagingPath) => extractZip(archive, stagingPath),
      ...(args.validate === undefined ? {} : { validate: args.validate }),
      inspect: computeMaterializedTreeIntegrity,
    });
    return {
      canonicalPath: result.canonicalPath,
      treeIntegrity: result.inspection,
    };
  });

export const materializeRegistryPackage = (args: MaterializeRegistryPackageArgs) =>
  materializeRegistryPackageWithTreeIntegrity(args).pipe(
    Effect.map(({ canonicalPath }) => canonicalPath),
  );

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

export const materializeExternalPackageWithTreeIntegrity = (
  args: MaterializeExternalPackageArgs,
): Effect.Effect<MaterializedPackage, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;

    yield* validatePathSafety(path, args.baseDir, args.canonicalPath);

    const sourcePath = stripFileProtocol(args.sourceLocation);
    const isSelfCopy = path.resolve(sourcePath) === path.resolve(args.canonicalPath);
    if (isSelfCopy) {
      return {
        canonicalPath: args.canonicalPath,
        treeIntegrity: yield* computeMaterializedTreeIntegrity(args.canonicalPath),
      };
    }

    const result = yield* replaceCanonicalDirectoryWithInspection({
      baseDir: args.baseDir,
      canonicalPath: args.canonicalPath,
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
      inspect: computeMaterializedTreeIntegrity,
    });
    return {
      canonicalPath: result.canonicalPath,
      treeIntegrity: result.inspection,
    };
  });

export const materializeExternalPackage = (args: MaterializeExternalPackageArgs) =>
  materializeExternalPackageWithTreeIntegrity(args).pipe(
    Effect.map(({ canonicalPath }) => canonicalPath),
  );
