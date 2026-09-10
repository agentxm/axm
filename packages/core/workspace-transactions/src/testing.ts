/**
 * @agentxm/workspace-transactions deterministic test ports.
 *
 * An in-memory transaction scope whose admission never touches a lock file,
 * and the fault-injection hooks that let a test or specification prove the
 * closure guarantees: a write failing at a chosen step after earlier writes
 * succeeded, a candidate turning stale under the lock, and a restoration
 * that cannot complete. Production source never imports this module.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";

import { makeMemoryTransitionLockWorld } from "./memory-transition-lock.js";
import {
  makeWorkspaceTransactionScope,
  WorkspaceTransactionScope,
  type WorkspaceTransactionPaths,
} from "./scope.js";
import type { WorkspaceTransitionLock } from "./transition-lock.js";

export {
  makeMemoryTransitionLockWorld,
  type MemoryTransitionLockWorld,
} from "./memory-transition-lock.js";

/**
 * A transaction scope over the given paths whose admission is one in-memory
 * world: no lock file is created, waits use Effect time, and `onAcquired`
 * hooks on the world run under the hold. Pass a `lock` to substitute the
 * admission entirely.
 */
export const WorkspaceTransactionScopeTest = (
  paths: WorkspaceTransactionPaths,
  options?: { readonly lock?: WorkspaceTransitionLock },
): Layer.Layer<WorkspaceTransactionScope> =>
  Layer.effect(
    WorkspaceTransactionScope,
    makeWorkspaceTransactionScope(
      paths,
      options?.lock ?? makeMemoryTransitionLockWorld().invocation(),
    ),
  );

/** One durable write the fault-injecting file system is about to perform. */
export type FileSystemWriteOperation =
  | { readonly kind: "writeFile" | "writeFileString"; readonly path: string }
  | { readonly kind: "makeDirectory" | "remove"; readonly path: string }
  | { readonly kind: "rename" | "copy"; readonly source: string; readonly path: string }
  | { readonly kind: "symlink"; readonly source: string; readonly path: string };

/**
 * A `FileSystem` over the ambient one that fails the writes `select` picks
 * with a typed platform error, leaving every other operation untouched.
 * Selecting the write of one projection target after settings, lock, and
 * canonical content were written proves failure-after-write restoration;
 * selecting the copy out of an `axm-rollback-` snapshot store proves the
 * restoration-incomplete path. Reads never fail here.
 */
export const injectWriteFaults = (
  select: (operation: FileSystemWriteOperation) => boolean,
  description = "injected write fault",
): Layer.Layer<FileSystem.FileSystem, never, FileSystem.FileSystem> =>
  Layer.effect(
    FileSystem.FileSystem,
    Effect.map(FileSystem.FileSystem, (real): FileSystem.FileSystem => {
      const fault = (method: string) =>
        Effect.fail(PlatformError.badArgument({ module: "FileSystem", method, description }));
      const guard = <A, E>(
        operation: FileSystemWriteOperation,
        run: Effect.Effect<A, E>,
      ): Effect.Effect<A, E | PlatformError.PlatformError> =>
        select(operation) ? fault(operation.kind) : run;
      return {
        ...real,
        writeFile: (path, data, options) =>
          guard({ kind: "writeFile", path }, real.writeFile(path, data, options)),
        writeFileString: (path, data, options) =>
          guard({ kind: "writeFileString", path }, real.writeFileString(path, data, options)),
        makeDirectory: (path, options) =>
          guard({ kind: "makeDirectory", path }, real.makeDirectory(path, options)),
        remove: (path, options) => guard({ kind: "remove", path }, real.remove(path, options)),
        rename: (source, path) =>
          guard({ kind: "rename", source, path }, real.rename(source, path)),
        copy: (source, path, options) =>
          guard({ kind: "copy", source, path }, real.copy(source, path, options)),
        symlink: (source, path) =>
          guard({ kind: "symlink", source, path }, real.symlink(source, path)),
      };
    }),
  );
