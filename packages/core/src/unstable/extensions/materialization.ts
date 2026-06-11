/**
 * Shared canonical-store materialization helpers for extension packages.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { makeAppError, type AppError } from "../app-error/index.js";
import { createRegistryClient, extractZip } from "../registry/index.js";
import { computeIntegrity, stripFileProtocol } from "../utils/index.js";
import type { Version, VersionRange } from "../version-constraints/version-constraints.js";
import type { ExtensionName, ExtensionType } from "./common.js";
import type { Handle } from "./handle.js";
import { copyExtensionDirectory, validatePathSafety } from "./utils.js";

export type RegistryPackageMaterializationArgs = {
  readonly baseDir: string;
  readonly canonicalPath: string;
  readonly sourceLocation: URL;
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
  readonly version: Version | VersionRange;
  readonly integrity: Option.Option<string>;
  readonly copyFailureDetail?: string;
  readonly prepareDestination?: Effect.Effect<void, AppError, FileSystem.FileSystem | Path.Path>;
};

export const materializeRegistryPackage = (args: RegistryPackageMaterializationArgs) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    yield* validatePathSafety(args.baseDir, args.canonicalPath);

    const canonicalExists = yield* fs.exists(args.canonicalPath).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "internal",
          detail: `Failed to check if canonical path exists: ${args.canonicalPath}`,
          cause,
        }),
      ),
    );
    const useExisting = Option.isNone(args.integrity) && canonicalExists;
    if (useExisting) return args.canonicalPath;

    const location =
      args.sourceLocation.protocol === "file:"
        ? args.sourceLocation.pathname
        : args.sourceLocation.href;
    const client = yield* createRegistryClient(location);
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
          code: "internal",
          detail: `Integrity mismatch for ${args.name}@${args.version}`,
        });
      }
    }

    const tmpDir = yield* fs.makeTempDirectory().pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: "Temporary directory for registry install could not be created",
          cause,
        }),
      ),
    );

    yield* Effect.ensuring(
      Effect.gen(function* () {
        yield* extractZip(archive, tmpDir);
        if (args.prepareDestination !== undefined) {
          yield* args.prepareDestination;
        }
        yield* fs.remove(args.canonicalPath, { recursive: true }).pipe(Effect.ignore);
        yield* copyExtensionDirectory(tmpDir, args.canonicalPath).pipe(
          Effect.mapError((cause) =>
            makeAppError({
              code: "validation",
              detail:
                args.copyFailureDetail ??
                `Failed to copy registry package files to ${args.canonicalPath}`,
              cause,
            }),
          ),
        );
      }),
      fs.remove(tmpDir, { recursive: true }).pipe(Effect.ignore),
    );

    return args.canonicalPath;
  });

export type ExternalPackageMaterializationArgs = {
  readonly baseDir: string;
  readonly canonicalPath: string;
  readonly sourceLocation: string;
  readonly packageLabel: string;
  readonly copyFailureDetail?: string;
  readonly prepareDestination?: Effect.Effect<void, AppError, FileSystem.FileSystem | Path.Path>;
};

export const materializeExternalPackage = (args: ExternalPackageMaterializationArgs) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    yield* validatePathSafety(args.baseDir, args.canonicalPath);

    const sourcePath = stripFileProtocol(args.sourceLocation);
    const isSelfCopy = path.resolve(sourcePath) === path.resolve(args.canonicalPath);
    if (isSelfCopy) return args.canonicalPath;

    if (args.prepareDestination !== undefined) {
      yield* args.prepareDestination;
    }
    yield* fs.remove(args.canonicalPath, { recursive: true }).pipe(Effect.ignore);
    yield* copyExtensionDirectory(sourcePath, args.canonicalPath).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail:
            args.copyFailureDetail ??
            `Failed to copy ${args.packageLabel} files to ${args.canonicalPath}`,
          cause,
        }),
      ),
    );

    return args.canonicalPath;
  });
