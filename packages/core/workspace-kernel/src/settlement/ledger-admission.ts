/** Trace only admission to the existing synchronized ledger, without replacing its lock. */
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as SynchronizedRef from "effect/SynchronizedRef";
import type { TransactionLedger } from "./ledger.js";

export const updateTransactionLedger = <E, R>(
  ledger: SynchronizedRef.SynchronizedRef<TransactionLedger>,
  update: (current: TransactionLedger) => Effect.Effect<TransactionLedger, E, R>,
): Effect.Effect<void, E, R> =>
  Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const span = yield* Effect.makeSpan("axm.wait.transaction-ledger");
      const end = (exit: Exit.Exit<unknown, unknown>) =>
        Effect.gen(function* () {
          if (span.status._tag === "Ended") return;
          span.end(yield* Clock.currentTimeNanos, exit);
        });
      // makeSpan does not change the current parent: ledger work is not a child of its wait.
      const transition = SynchronizedRef.updateEffect(ledger, (current) =>
        end(Exit.void).pipe(Effect.andThen(Effect.suspend(() => update(current)))),
      );
      return yield* Effect.onExit(restore(transition), end);
    }),
  );
