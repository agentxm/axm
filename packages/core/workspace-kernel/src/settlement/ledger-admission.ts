/** Observe admission to the existing synchronized ledger, without replacing its lock. */
import { captureWork } from "@agentxm/host-primitives/work-observation";
import * as Cause from "effect/Cause";
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
      const transition = SynchronizedRef.updateEffect(ledger, (current) =>
        end(Exit.void).pipe(Effect.andThen(Effect.suspend(() => update(current)))),
      );
      return yield* Effect.onExit(restore(transition), end);
    }),
  );
