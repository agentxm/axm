/** Observe admission to the existing synchronized ledger, without replacing its lock. */
import { captureWork } from "@agentxm/host-primitives/work-observation";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as SynchronizedRef from "effect/SynchronizedRef";
import type { TransactionLedger } from "./ledger.js";

/** One observed admission; `transition` runs `entered` first, under the ledger's lock. */
const admit = <A, E, R>(
  transition: (entered: Effect.Effect<void>) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const work = (yield* captureWork)?.begin("axm.admission.transaction-ledger");
      const end = (exit: Exit.Exit<unknown, unknown>) =>
        Effect.sync(() =>
          work?.finish(
            Exit.isSuccess(exit)
              ? "success"
              : Cause.hasInterruptsOnly(exit.cause)
                ? "interrupted"
                : "failure",
          ),
        );
      // Admission includes uncontended calls. It ends before ledger work and is not its parent.
      return yield* Effect.onExit(restore(transition(end(Exit.void))), end);
    }),
  );

export const updateTransactionLedger = <E, R>(
  ledger: SynchronizedRef.SynchronizedRef<TransactionLedger>,
  update: (current: TransactionLedger) => Effect.Effect<TransactionLedger, E, R>,
): Effect.Effect<void, E, R> =>
  admit((entered) =>
    SynchronizedRef.updateEffect(ledger, (current) =>
      entered.pipe(Effect.andThen(Effect.suspend(() => update(current)))),
    ),
  );

/** One admission that commits the returned ledger and yields the separate result. */
export const modifyTransactionLedger = <A, E, R>(
  ledger: SynchronizedRef.SynchronizedRef<TransactionLedger>,
  modify: (current: TransactionLedger) => Effect.Effect<readonly [A, TransactionLedger], E, R>,
): Effect.Effect<A, E, R> =>
  admit((entered) =>
    SynchronizedRef.modifyEffect(ledger, (current) =>
      entered.pipe(Effect.andThen(Effect.suspend(() => modify(current)))),
    ),
  );
