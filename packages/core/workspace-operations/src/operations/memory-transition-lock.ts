/**
 * Deterministic in-process workspace transition admission for tests.
 *
 * One world owns admission state while each invocation receives an isolated
 * ownership view. Waiting uses Effect time so contention and interruption can
 * be exercised without native timers or lock files.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Semaphore from "effect/Semaphore";

import type { TransitionLockHolder } from "@agentxm/workspace-state";
import type { HeldWorkspaceTransition, WorkspaceTransitionLock } from "./transition-lock.js";

export interface MemoryTransitionLockWorld {
  readonly counts: () => { readonly acquisitions: number; readonly releases: number };
  readonly invocation: () => WorkspaceTransitionLock;
}

/** Make one isolated admission world for a deterministic test scenario. */
export const makeMemoryTransitionLockWorld = (): MemoryTransitionLockWorld => {
  const admission = Semaphore.makeUnsafe(1);
  let acquisitions = 0;
  let releases = 0;
  let holder: Option.Option<TransitionLockHolder> = Option.none();

  return {
    counts: () => ({ acquisitions, releases }),
    invocation: () => {
      let held: { readonly directory: string; readonly lease: HeldWorkspaceTransition } | undefined;

      return {
        held: (directory) => (held?.directory === directory ? held.lease : undefined),
        acquire: (args) =>
          Effect.uninterruptibleMask((restore) =>
            Effect.gen(function* () {
              let waitedMillis = 0;
              let reportedWaiting = false;

              while (!(yield* admission.takeIfAvailable(1))) {
                if (!reportedWaiting && args.onWaiting !== undefined) {
                  yield* restore(args.onWaiting(holder));
                  reportedWaiting = true;
                }
                if (waitedMillis >= (args.waitBoundMillis ?? 60_000)) {
                  return Option.some({ holder, waitedMillis });
                }
                yield* restore(Effect.sleep("250 millis"));
                waitedMillis += 250;
              }

              holder = Option.some(args.holder);
              acquisitions += 1;
              held = {
                directory: args.workspaceDir,
                lease: { compromised: Effect.never, isCompromised: () => false },
              };
              yield* Effect.addFinalizer(() =>
                Effect.gen(function* () {
                  held = undefined;
                  holder = Option.none();
                  releases += 1;
                  yield* admission.release(1);
                }),
              );
              return Option.none();
            }),
          ),
      };
    },
  };
};
