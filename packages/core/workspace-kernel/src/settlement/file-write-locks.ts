/** In-process exclusion for file mutations shared by one invocation. */

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as RcMap from "effect/RcMap";
import * as Semaphore from "effect/Semaphore";
import { resolveNativeReferent } from "../locations/index.js";
import { claimWorkspaceContent } from "./context.js";
import { WorkspaceSnapshotError } from "./errors.js";

export interface WorkspaceFileWriteLocksService {
  /** Serialize the entire read/modify/write while preserving the caller's context. */
  readonly withLock: <A, E, R>(
    target: string,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | WorkspaceSnapshotError, R>;
}

/** Provide once across all workspace graphs that share an invocation. */
export class WorkspaceFileWriteLocks extends Context.Service<
  WorkspaceFileWriteLocks,
  WorkspaceFileWriteLocksService
>()("@agentxm/workspace-kernel/settlement/WorkspaceFileWriteLocks") {}

export const makeWorkspaceFileWriteLocks = Effect.gen(function* () {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  // Zero idle retention: semaphores cost nothing to reconnect. Keys exist only
  // while writers or waiters borrow them, never for previously visited paths.
  const locks = yield* RcMap.make({ lookup: (_key: string) => Semaphore.make(1) });
  const withLock: WorkspaceFileWriteLocksService["withLock"] = (target, effect) =>
    Effect.scoped(
      Effect.gen(function* () {
        // Borrow before waiting so the last active writer cannot evict a key
        // while another writer is still waiting for its permit.
        const resolve = resolveNativeReferent(target).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
          Effect.mapError(
            (cause) => new WorkspaceSnapshotError({ target, step: "inspect-target", cause }),
          ),
        );
        const physical = yield* resolve;
        const semaphore = yield* RcMap.get(locks, physical);
        return yield* semaphore.withPermits(1)(
          Effect.gen(function* () {
            yield* claimWorkspaceContent(target);
            if ((yield* resolve) !== physical)
              return yield* new WorkspaceSnapshotError({
                target,
                step: "inspect-target",
                cause: "native-alias-changed",
              });
            return yield* effect;
          }),
        );
      }),
    );
  return { service: WorkspaceFileWriteLocks.of({ withLock }), retainedPaths: RcMap.keys(locks) };
});
