/**
 * Deterministic in-process workspace transition admission for tests.
 *
 * One world owns admission state while each invocation receives an isolated
 * ownership view. Waiting uses Effect time so contention and interruption can
 * be exercised without native timers or lock files. The world can observe
 * every acquisition, which lets a specification act exactly between
 * confirmation and revalidation — the window a stale candidate is caught in.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Semaphore from "effect/Semaphore";

import type { TransitionLockHolder } from "./errors.js";
import type { HeldWorkspaceTransition, WorkspaceTransitionLock } from "./transition-lock.js";

export interface MemoryTransitionLockWorld {
  readonly counts: () => { readonly acquisitions: number; readonly releases: number };
  /** One invocation's lock: its own held view over the world's admission. */
  readonly invocation: () => WorkspaceTransitionLock;
  /**
   * Run `effect` each time an invocation is admitted, after the hold is
   * recorded and before acquisition returns. A specification uses it to
   * change material state under the lock.
   */
  readonly onAcquired: (
    effect: (holder: TransitionLockHolder) => Effect.Effect<void>,
  ) => Effect.Effect<void>;
}

/** Make one isolated admission world for a deterministic test scenario. */
export const makeMemoryTransitionLockWorld = (): MemoryTransitionLockWorld => {
  const admission = Semaphore.makeUnsafe(1);
  const counts = Ref.makeUnsafe({ acquisitions: 0, releases: 0 });
  const holder = Ref.makeUnsafe<Option.Option<TransitionLockHolder>>(Option.none());
  const acquiredHooks = Ref.makeUnsafe<
    ReadonlyArray<(holder: TransitionLockHolder) => Effect.Effect<void>>
  >([]);

  return {
    counts: () => Ref.getUnsafe(counts),
    onAcquired: (effect) => Ref.update(acquiredHooks, (hooks) => [...hooks, effect]),
    invocation: () => {
      const held = Ref.makeUnsafe<
        Option.Option<{ readonly directory: string; readonly lease: HeldWorkspaceTransition }>
      >(Option.none());

      return {
        held: (directory) =>
          Effect.map(Ref.get(held), (current) =>
            Option.flatMap(current, (value) =>
              value.directory === directory ? Option.some(value.lease) : Option.none(),
            ),
          ),
        acquire: (args) =>
          Effect.uninterruptibleMask((restore) =>
            Effect.gen(function* () {
              let waitedMillis = 0;
              let reportedWaiting = false;

              while (!(yield* admission.takeIfAvailable(1))) {
                if (!reportedWaiting && args.onWaiting !== undefined) {
                  yield* restore(args.onWaiting(yield* Ref.get(holder)));
                  reportedWaiting = true;
                }
                if (waitedMillis >= (args.waitBoundMillis ?? 60_000)) {
                  return Option.some({ holder: yield* Ref.get(holder), waitedMillis });
                }
                yield* restore(Effect.sleep("250 millis"));
                waitedMillis += 250;
              }

              yield* Ref.set(holder, Option.some(args.holder));
              yield* Ref.update(counts, (value) => ({
                ...value,
                acquisitions: value.acquisitions + 1,
              }));
              yield* Ref.set(
                held,
                Option.some({
                  directory: args.workspaceDir,
                  lease: { compromised: Effect.never, isCompromised: () => false },
                }),
              );
              yield* Effect.addFinalizer(() =>
                Effect.gen(function* () {
                  yield* Ref.set(held, Option.none());
                  yield* Ref.set(holder, Option.none());
                  yield* Ref.update(counts, (value) => ({
                    ...value,
                    releases: value.releases + 1,
                  }));
                  yield* admission.release(1);
                }),
              );
              const hooks = yield* Ref.get(acquiredHooks);
              yield* restore(Effect.forEach(hooks, (hook) => hook(args.holder), { discard: true }));
              return Option.none();
            }),
          ),
      };
    },
  };
};
