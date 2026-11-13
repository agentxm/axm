import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";

/** Completed archive primitives; consumers decide whether and how to retain these facts. */
export interface ArchiveWorkFact {
  readonly kind: "parse" | "read-member" | "parse-manifest";
  readonly outcome: "success" | "failure" | "interrupted";
  readonly durationMillis?: number;
  readonly entries?: number;
}

export interface ArchiveWorkObserver {
  readonly record: (fact: ArchiveWorkFact) => Effect.Effect<void>;
}

export const CurrentArchiveWorkObserver = Context.Reference<ArchiveWorkObserver | undefined>(
  "@agentxm/extension-content/CurrentArchiveWorkObserver",
  { defaultValue: () => undefined },
);

/** No observer means no timing or span allocation; observation never changes the archive result. */
export const observeArchiveWork = <A, E, R>(
  kind: ArchiveWorkFact["kind"],
  effect: Effect.Effect<A, E, R>,
  entriesOnSuccess?: (value: A) => number,
): Effect.Effect<A, E, R> =>
  Effect.flatMap(CurrentArchiveWorkObserver, (observer) => {
    if (observer === undefined) return effect;
    return Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        const clock = yield* Clock.Clock;
        const start = clock.monotonicTimeNanosUnsafe();
        return yield* restore(effect).pipe(
          Effect.onExit((exit) =>
            Effect.suspend(() =>
              observer.record({
                kind,
                outcome: Exit.isSuccess(exit)
                  ? "success"
                  : Cause.hasInterruptsOnly(exit.cause)
                    ? "interrupted"
                    : "failure",
                durationMillis: Number(clock.monotonicTimeNanosUnsafe() - start) / 1_000_000,
                ...(Exit.isSuccess(exit) && entriesOnSuccess !== undefined
                  ? { entries: entriesOnSuccess(exit.value) }
                  : {}),
              }),
            ).pipe(Effect.ignoreCause),
          ),
        );
      }),
    );
  });
