import { NativeEntryRemoval } from "../locations/index.js";
import type * as Context from "effect/Context";
/** Filesystem transaction composition, with one admission permit and lock instance per runtime. */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Semaphore from "effect/Semaphore";

import {
  WorkspaceTransactionScope,
  WorkspaceTransactionScopes,
  type WorkspaceTransactionPaths,
  type WorkspaceTransactionScopeService,
} from "./scope.js";
import { runFilesystemTransaction, type FilesystemTransactionRuntime } from "./transaction.js";
import { makeWorkspaceTransitionLock, type WorkspaceTransitionLock } from "./transition-lock.js";
import { makeWorkspaceFileWriteLocks, WorkspaceFileWriteLocks } from "./file-write-locks.js";
import { assertNativeMutationWithin, captureNativeAuthorityRoots } from "../locations/index.js";
import { BoundaryClaimsDirectory } from "./boundary-claims.js";
import { WorkspaceDirectoryError } from "./errors.js";

/** One owner shared across every workspace graph in an invocation. */
export const WorkspaceFileWriteLocksLive = Layer.effect(
  WorkspaceFileWriteLocks,
  Effect.map(makeWorkspaceFileWriteLocks, ({ service }) => service),
);

const makeFilesystemScope = Effect.fnUntraced(function* (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  removal: Context.Service.Shape<typeof NativeEntryRemoval>,
  paths: WorkspaceTransactionPaths,
  providedLock?: WorkspaceTransitionLock,
  boundaryClaimsDirectory?: string | null,
): Effect.fn.Return<WorkspaceTransactionScopeService> {
  const admission = yield* Semaphore.make(1);
  const lock = providedLock ?? (yield* makeWorkspaceTransitionLock);
  const workspaceDir = path.resolve(paths.workspaceDir);
  const nativeRoots = paths.nativeRoots ?? [paths.nativeRoot ?? path.dirname(workspaceDir)];
  const nativeRootWitnesses = yield* captureNativeAuthorityRoots(nativeRoots).pipe(
    Effect.provideService(FileSystem.FileSystem, fs),
    Effect.provideService(Path.Path, path),
  );
  const held = lock.held(workspaceDir);
  const acquire: WorkspaceTransactionScopeService["acquire"] = Effect.fnUntraced(
    function* (request: Parameters<WorkspaceTransactionScopeService["acquire"]>[0]) {
      const nativeRoot = paths.nativeRoot ?? path.dirname(workspaceDir);
      for (const target of [workspaceDir, path.join(workspaceDir, "tmp")]) {
        yield* assertNativeMutationWithin(
          nativeRoot,
          target,
          "content",
          path.dirname(workspaceDir),
        ).pipe(
          Effect.mapError(
            (cause) => new WorkspaceDirectoryError({ path: target, step: "inspect", cause }),
          ),
        );
      }
      return yield* lock.acquire({
        workspaceDir,
        nativeRoot,
        holder: {
          command: request.command,
          pid: process.pid,
          ...(request.candidateId === undefined ? {} : { candidateId: request.candidateId }),
        },
        ...(request.onWaiting === undefined ? {} : { onWaiting: request.onWaiting }),
      });
    },
    Effect.provideService(FileSystem.FileSystem, fs),
    Effect.provideService(Path.Path, path),
    Effect.provideService(NativeEntryRemoval, removal),
  );
  const runtime: FilesystemTransactionRuntime = {
    ...paths,
    workspaceDir,
    nativeRoots,
    nativeRootWitnesses,
    boundaryClaimsDirectory,
    fs,
    removal,
    path,
    admission,
    acquire,
    held,
  };
  const service: WorkspaceTransactionScopeService = {
    acquire,
    isHeld: Effect.map(held, Option.isSome),
    createdDirectories: Effect.flatMap(held, (value) =>
      Option.isSome(value) ? value.value.createdDirectories : Effect.succeed([]),
    ),
    run: (args) =>
      runFilesystemTransaction(runtime, args).pipe(
        Effect.provideService(WorkspaceTransactionScope, service),
      ),
  };
  return service;
});

export const makeWorkspaceTransactionScope = Effect.fnUntraced(function* (
  paths: WorkspaceTransactionPaths,
  lock?: WorkspaceTransitionLock,
): Effect.fn.Return<
  WorkspaceTransactionScopeService,
  never,
  FileSystem.FileSystem | Path.Path | NativeEntryRemoval
> {
  const fs = yield* FileSystem.FileSystem;
  const removal = yield* NativeEntryRemoval;
  const path = yield* Path.Path;
  const directory = yield* BoundaryClaimsDirectory;
  return yield* makeFilesystemScope(fs, path, removal, paths, lock, directory);
});

export const WorkspaceTransactionScopesLive: Layer.Layer<
  WorkspaceTransactionScopes,
  never,
  FileSystem.FileSystem | Path.Path | NativeEntryRemoval
> = Layer.effect(
  WorkspaceTransactionScopes,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const removal = yield* NativeEntryRemoval;
    const path = yield* Path.Path;
    const directory = yield* BoundaryClaimsDirectory;
    return {
      forWorkspace: (paths) => makeFilesystemScope(fs, path, removal, paths, undefined, directory),
    };
  }),
);

export const WorkspaceTransactionScopeLive = (
  paths: WorkspaceTransactionPaths,
): Layer.Layer<
  WorkspaceTransactionScope,
  never,
  FileSystem.FileSystem | Path.Path | NativeEntryRemoval
> => Layer.effect(WorkspaceTransactionScope, makeWorkspaceTransactionScope(paths));
