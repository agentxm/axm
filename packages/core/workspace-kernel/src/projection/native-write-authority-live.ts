/**
 * Core implementation of the native-write port the agent adapters declare.
 *
 * Native writers own the format; the workspace transaction owns protection and
 * durable-change accounting. This layer joins the two, so a native target that
 * cannot be snapshotted is never mutated.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { NativeWriteAuthority, NativeWriteRefused } from "../agent-adapters/index.js";
import {
  protectWorkspacePath,
  protectCreatedAncestors,
  recordFootprint,
  WorkspaceFileWriteLocks,
} from "../settlement/index.js";
import { makeNativeInsertionAuthority } from "./native-insertion-receipts.js";

export const NativeWriteAuthorityLive = Layer.effect(
  NativeWriteAuthority,
  Effect.gen(function* () {
    const locks = yield* WorkspaceFileWriteLocks;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { authorize, ...insertion } = yield* makeNativeInsertionAuthority;
    return NativeWriteAuthority.of({
      ...insertion,
      withExclusiveWrite: (absolutePath, effect) =>
        locks
          .withLock(absolutePath, effect)
          .pipe(
            Effect.catchTag("WorkspaceSnapshotError", (cause) =>
              Effect.fail(new NativeWriteRefused({ path: absolutePath, cause })),
            ),
          ),
      protect: (absolutePath: string) =>
        authorize(absolutePath).pipe(
          Effect.andThen(protectCreatedAncestors(fs, path, path.dirname(absolutePath))),
          Effect.andThen(protectWorkspacePath(absolutePath)),
          Effect.mapError((cause) => new NativeWriteRefused({ path: absolutePath, cause })),
        ),
      record: (change) => recordFootprint(change),
    });
  }),
);
