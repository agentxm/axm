/**
 * State shared by the narrow workspace services of one workspace lifetime:
 * the in-process mutation mutex every writer serializes on, and the merged
 * source-host cache the settings reader fills and the settings writer
 * invalidates. Provided by the live composition; not part of the public API.
 */

import * as ServiceMap from "effect/Context";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Semaphore from "effect/Semaphore";

import type { SourceHostConfig } from "../desired/settings/index.js";

export interface WorkspaceStateSharedService {
  /** Serializes every settings and lockfile mutation of one runtime. */
  readonly mutex: Semaphore.Semaphore;
  /** Merged sources, cached per workspace lifetime until a source is added. */
  readonly sourcesCache: Ref.Ref<Option.Option<ReadonlyArray<SourceHostConfig>>>;
}

export class WorkspaceStateShared extends ServiceMap.Service<
  WorkspaceStateShared,
  WorkspaceStateSharedService
>()("@agentxm/workspace-kernel/workspace-state/WorkspaceStateShared") {}

/** Attribute admission separately while leaving permit lifetime and interruption to Effect. */
export const withWorkspaceStateWrite =
  (mutex: Semaphore.Semaphore, owner: "settings" | "desired-state" | "accepted-resolution") =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        const span = yield* Effect.makeSpan("axm.wait.document-writer", {
          attributes: { "axm.wait.owner": owner },
        });
        const end = (exit: Exit.Exit<unknown, unknown>) =>
          Effect.gen(function* () {
            if (span.status._tag === "Ended") return;
            span.end(yield* Clock.currentTimeNanos, exit);
          });
        const admitted = mutex.withPermits(1)(end(Exit.void).pipe(Effect.andThen(effect)));
        return yield* Effect.onExit(restore(admitted), end);
      }),
    );

export const makeWorkspaceStateShared: Effect.Effect<WorkspaceStateSharedService> = Effect.gen(
  function* () {
    return {
      mutex: yield* Semaphore.make(1),
      sourcesCache: yield* Ref.make<Option.Option<ReadonlyArray<SourceHostConfig>>>(Option.none()),
    };
  },
);
