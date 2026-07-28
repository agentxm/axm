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
import type { ExtensionName, ExtensionType } from "./common.js";
import type { Handle } from "./handle.js";
import { shouldReuseCanonicalInstall } from "./canonical-reuse.js";
import { copyExtensionDirectory, validatePathSafety } from "./utils.js";

const registryLocationForClient = (location: URL): string =>
  location.protocol === "file:" ? location.pathname : location.href;

export interface RegistryPackageMaterializationMessages {
  readonly existsFailureDetail: (canonicalPath: string) => string;
  readonly integrityMismatchDetail: string;
  readonly integrityMismatchCode: AppErrorCode;
  readonly tempDirectoryFailureDetail: string;
  readonly createDirectoryFailureDetail: (canonicalPath: string) => string;
  readonly inspectExtractedFailureDetail: string;
  readonly copyEntryFailureDetail: (entry: string) => string;
  readonly copyEntryFailureCode: AppErrorCode;
}

export interface MaterializeRegistryPackageArgs {
  readonly baseDir: string;
  readonly canonicalPath: string;
  readonly sourceLocation: URL;
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
  readonly version: Version | VersionRange;
  readonly integrity: Option.Option<string>;
  readonly messages: RegistryPackageMaterializationMessages;
  /** When true, re-materialize unconditionally instead of reusing an existing canonical tree. */
  readonly force?: boolean;
  /** Resolved version recorded in the current lockfile entry, when any. */
  readonly lockedVersion?: string;
}

export const materializeRegistryPackage = (args: MaterializeRegistryPackageArgs) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    yield* validatePathSafety(args.baseDir, args.canonicalPath);

    const canonicalExists = yield* fs.exists(args.canonicalPath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: args.messages.existsFailureDetail(args.canonicalPath),
          cause: error,
        }),
      ),
    );
    const useExisting = shouldReuseCanonicalInstall({
      canonicalExists,
      force: args.force === true,
      hasIntegrity: Option.isSome(args.integrity),
      refVersion: args.version,
      lockedVersion: args.lockedVersion,
    });
    if (useExisting) return args.canonicalPath;

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

    yield* Effect.ensuring(
      Effect.gen(function* () {
        yield* extractZip(archive, tmpDir);
        yield* fs.remove(args.canonicalPath, { recursive: true }).pipe(Effect.ignore);
        yield* fs.makeDirectory(args.canonicalPath, { recursive: true }).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "validation",
              detail: args.messages.createDirectoryFailureDetail(args.canonicalPath),
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
            fs.copy(path.join(tmpDir, entry), path.join(args.canonicalPath, entry)).pipe(
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
      }),
      fs.remove(tmpDir, { recursive: true }).pipe(Effect.ignore),
    );

    return args.canonicalPath;
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

    yield* fs.remove(args.canonicalPath, { recursive: true }).pipe(Effect.ignore);
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
