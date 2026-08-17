/**
 * Shared canonical package materialization helpers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type { AppErrorCode } from "../app-error/index.js";
import { makeAppError } from "../app-error/index.js";
import type { Version, VersionRange } from "../version-constraints/version-constraints.js";
import { createRegistryClient, extractZip } from "../registry/index.js";
import { computeIntegrity, stripFileProtocol } from "../utils/index.js";
import { protectWorkspacePath } from "../workspace/transaction.js";
import type { ExtensionName, ExtensionType } from "./common.js";
import type { Handle } from "./handle.js";
import { shouldReuseCanonicalInstall } from "./canonical-reuse.js";
import { copyExtensionDirectory, validatePathSafety } from "./utils.js";

const registryLocationForClient = (location: URL): string =>
  location.protocol === "file:" ? location.pathname : location.href;

export interface RegistryPackageMaterializationMessages {
  readonly integrityMismatchDetail: string;
  readonly integrityMismatchCode: AppErrorCode;
  readonly tempDirectoryFailureDetail: string;
  readonly createDirectoryFailureDetail: (destinationPath: string) => string;
  readonly inspectExtractedFailureDetail: string;
  readonly copyEntryFailureDetail: (entry: string) => string;
  readonly copyEntryFailureCode: AppErrorCode;
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
  /** Pinned archive integrity carried by the ref being installed. */
  readonly integrity: Option.Option<string>;
  /** Exact version requested by the ref being installed. */
  readonly version: Version | VersionRange;
  /** Resolved version recorded in the current lockfile entry, when any. */
  readonly lockedVersion?: string;
  readonly existsFailureDetail: (installedPath: string) => string;
}

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
      hasIntegrity: Option.isSome(args.integrity),
      refVersion: args.version,
      lockedVersion: args.lockedVersion,
    });
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
  readonly messages: RegistryPackageMaterializationMessages;
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
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    yield* validatePathSafety(args.baseDir, args.destinationPath);

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

    const tmpDir = yield* fs.makeTempDirectory().pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "validation",
          detail: args.messages.tempDirectoryFailureDetail,
          cause: error,
        }),
      ),
    );

    const cleanup = fs.remove(tmpDir, { recursive: true }).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to remove temporary package directory ${tmpDir}`,
          cause: error,
        }),
      ),
    );
    yield* Effect.gen(function* () {
      yield* extractZip(archive, tmpDir);
      yield* protectWorkspacePath(args.destinationPath);
      yield* fs.remove(args.destinationPath, { recursive: true, force: true }).pipe(
        Effect.mapError((error) =>
          makeAppError({
            code: "internal",
            detail: `Failed to replace canonical package at ${args.destinationPath}`,
            cause: error,
          }),
        ),
      );
      yield* fs.makeDirectory(args.destinationPath, { recursive: true }).pipe(
        Effect.mapError((error) =>
          makeAppError({
            code: "validation",
            detail: args.messages.createDirectoryFailureDetail(args.destinationPath),
            cause: error,
          }),
        ),
      );
      const entries = yield* fs.readDirectory(tmpDir).pipe(
        Effect.mapError((error) =>
          makeAppError({
            code: "validation",
            detail: args.messages.inspectExtractedFailureDetail,
            cause: error,
          }),
        ),
      );
      yield* Effect.forEach(
        entries,
        (entry) =>
          fs.copy(path.join(tmpDir, entry), path.join(args.destinationPath, entry)).pipe(
            Effect.mapError((error) =>
              makeAppError({
                code: args.messages.copyEntryFailureCode,
                detail: args.messages.copyEntryFailureDetail(entry),
                cause: error,
              }),
            ),
          ),
        { concurrency: "unbounded" },
      );
    }).pipe(
      Effect.tapError(() => cleanup),
      Effect.tap(() => cleanup),
    );

    return args.destinationPath;
  });

export interface MaterializeExternalPackageArgs {
  readonly baseDir: string;
  readonly canonicalPath: string;
  readonly sourceLocation: string;
  readonly copyFailureCode: AppErrorCode;
  readonly copyFailureDetail: (canonicalPath: string) => string;
}

export const materializeExternalPackage = (args: MaterializeExternalPackageArgs) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    yield* validatePathSafety(args.baseDir, args.canonicalPath);

    const sourcePath = stripFileProtocol(args.sourceLocation);
    const isSelfCopy = path.resolve(sourcePath) === path.resolve(args.canonicalPath);
    if (isSelfCopy) return args.canonicalPath;

    yield* protectWorkspacePath(args.canonicalPath);
    yield* fs.remove(args.canonicalPath, { recursive: true, force: true }).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to replace canonical package at ${args.canonicalPath}`,
          cause: error,
        }),
      ),
    );
    yield* copyExtensionDirectory(sourcePath, args.canonicalPath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: args.copyFailureCode,
          detail: args.copyFailureDetail(args.canonicalPath),
          cause: error,
        }),
      ),
    );

    return args.canonicalPath;
  });
