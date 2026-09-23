/** Filesystem encoding and transaction-aware publication of workspace documents. */

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import { commitLockfileSnapshotUpdateAtPath } from "../../../lockfile/index.js";
import { LockfileValidationError } from "../../../lockfile/errors.js";
import { writeSettingsAtPath } from "../../../settings/index.js";
import { WorkspaceDocuments } from "../../documents.js";
import { WorkspaceLocation } from "../../location.js";
import { readLockfileCell, readSettingsOrDefault } from "../../state-cells.js";
import { WorkspaceFileWriteLocks } from "../../../../transitions/settlement/index.js";

export const FilesystemWorkspaceDocuments: Layer.Layer<
  WorkspaceDocuments,
  never,
  WorkspaceLocation | FileSystem.FileSystem | Path.Path | WorkspaceFileWriteLocks
> = Layer.effect(
  WorkspaceDocuments,
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const fs = yield* FileSystem.FileSystem;
    const io = Context.make(FileSystem.FileSystem, fs).pipe(
      Context.add(Path.Path, yield* Path.Path),
      Context.add(WorkspaceFileWriteLocks, yield* WorkspaceFileWriteLocks),
    );
    const acceptedResolutions = readLockfileCell(location, location.runtimeDir).pipe(
      Effect.provideContext(io),
    );
    return WorkspaceDocuments.of({
      settings: (scope) =>
        readSettingsOrDefault(
          location,
          scope === undefined
            ? location.runtimeDir
            : scope === "user"
              ? location.userRuntimeDir
              : location.projectRuntimeDir,
          scope,
        ).pipe(Effect.provideContext(io)),
      acceptedResolutions,
      acceptedResolutionState: Effect.gen(function* () {
        const exists = yield* fs
          .exists(location.lockPath)
          .pipe(
            Effect.mapError(
              (cause) =>
                new LockfileValidationError({ path: location.lockPath, step: "probe", cause }),
            ),
          );
        if (!exists) return "missing";
        return yield* acceptedResolutions.pipe(
          Effect.as("ok" as const),
          Effect.catchTag(
            [
              "LockfileIoError",
              "LockfileParseError",
              "LockfileDecodeError",
              "LockfileVersionUnsupported",
            ],
            () => Effect.succeed("invalid" as const),
          ),
        );
      }),
      writeSettings: (next) =>
        writeSettingsAtPath(location.settingsPath, next).pipe(Effect.provideContext(io)),
      commitAcceptedResolutions: (base, next) =>
        commitLockfileSnapshotUpdateAtPath(location.lockPath, base, next).pipe(
          Effect.provideContext(io),
        ),
    });
  }),
);
