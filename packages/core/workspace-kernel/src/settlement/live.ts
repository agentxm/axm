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

/** One owner shared across every workspace graph in an invocation. */
export const WorkspaceFileWriteLocksLive = Layer.effect(
  WorkspaceFileWriteLocks,
  Effect.map(makeWorkspaceFileWriteLocks, ({ service }) => service),
);

const makeFilesystemScope = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  paths: WorkspaceTransactionPaths,
  providedLock?: WorkspaceTransitionLock,
): Effect.Effect<WorkspaceTransactionScopeService> =>
  Effect.gen(function* () {
    const admission = yield* Semaphore.make(1);
    const lock = providedLock ?? (yield* makeWorkspaceTransitionLock);
    const workspaceDir = path.resolve(paths.workspaceDir);
    const held = lock.held(workspaceDir);
    const acquire: WorkspaceTransactionScopeService["acquire"] = (request) =>
      lock
        .acquire({
          workspaceDir,
          holder: {
            command: request.command,
            pid: process.pid,
            ...(request.candidateId === undefined ? {} : { candidateId: request.candidateId }),
          },
          ...(request.onWaiting === undefined ? {} : { onWaiting: request.onWaiting }),
        })
        .pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
        );
    const runtime: FilesystemTransactionRuntime = {
      ...paths,
      workspaceDir,
      fs,
      path,
      admission,
      acquire,
      held,
    };
    return {
      acquire,
      isHeld: Effect.map(held, Option.isSome),
      run: (args) => runFilesystemTransaction(runtime, args),
    };
  });

export const makeWorkspaceTransactionScope = (
  paths: WorkspaceTransactionPaths,
  lock?: WorkspaceTransitionLock,
): Effect.Effect<WorkspaceTransactionScopeService, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return yield* makeFilesystemScope(fs, path, paths, lock);
  });

export const WorkspaceTransactionScopesLive: Layer.Layer<
  WorkspaceTransactionScopes,
  never,
  FileSystem.FileSystem | Path.Path
> = Layer.effect(
  WorkspaceTransactionScopes,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return { forWorkspace: (paths) => makeFilesystemScope(fs, path, paths) };
  }),
);

export const WorkspaceTransactionScopeLive = (
  paths: WorkspaceTransactionPaths,
): Layer.Layer<WorkspaceTransactionScope, never, FileSystem.FileSystem | Path.Path> =>
  Layer.effect(WorkspaceTransactionScope, makeWorkspaceTransactionScope(paths));
