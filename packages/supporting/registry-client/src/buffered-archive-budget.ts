import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Cause from "effect/Cause";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Semaphore from "effect/Semaphore";
import { captureWork } from "@agentxm/host-primitives/work-observation";

import { MAX_BUFFERED_ARCHIVE_BYTES } from "./archive-limits.js";

/** Download collection and its contiguous copy may coexist until extraction completes. */
export const BUFFERED_ARCHIVE_RESERVATION_BYTES = 2 * MAX_BUFFERED_ARCHIVE_BYTES;
export const MAX_OPERATION_BUFFERED_ARCHIVE_BYTES = 4 * BUFFERED_ARCHIVE_RESERVATION_BYTES;

export interface OperationBufferedArchiveBudgetService {
  readonly capacityBytes: number;
  readonly withBufferedArchive: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
}

/** Shared by Registry archive consumers in one CLI operation. */
export class OperationBufferedArchiveBudget extends ServiceMap.Service<
  OperationBufferedArchiveBudget,
  OperationBufferedArchiveBudgetService
>()("@agentxm/registry-client/buffered-archive-budget/OperationBufferedArchiveBudget") {}

export const makeOperationBufferedArchiveBudget = Effect.fnUntraced(function* (
  capacityBytes: number,
): Effect.fn.Return<OperationBufferedArchiveBudgetService> {
  if (
    !Number.isSafeInteger(capacityBytes) ||
    capacityBytes < BUFFERED_ARCHIVE_RESERVATION_BYTES ||
    capacityBytes % BUFFERED_ARCHIVE_RESERVATION_BYTES !== 0
  ) {
    return yield* Effect.die(
      new Error("Buffered archive capacity must be a positive whole reservation"),
    );
  }
  const semaphore = yield* Semaphore.make(capacityBytes / BUFFERED_ARCHIVE_RESERVATION_BYTES);
  return {
    capacityBytes,
    withBufferedArchive: (effect) =>
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const capture = yield* captureWork;
          const admission = capture?.begin("axm.admission.buffered-archive", {
            attributes: { "axm.admission.capacity": capacityBytes, "axm.admission.unit": "bytes" },
          });
          const end = (exit: Exit.Exit<unknown, unknown>) =>
            Effect.sync(() =>
              admission?.finish(
                Exit.isSuccess(exit)
                  ? "success"
                  : Cause.hasInterruptsOnly(exit.cause)
                    ? "interrupted"
                    : "failure",
              ),
            );
          const admitted = semaphore.withPermits(1)(end(Exit.void).pipe(Effect.andThen(effect)));
          return yield* Effect.onExit(restore(admitted), end);
        }),
      ),
  } satisfies OperationBufferedArchiveBudgetService;
});

export const withBufferedArchiveBudget = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.serviceOption(OperationBufferedArchiveBudget).pipe(
    Effect.flatMap((budget) =>
      Option.match(budget, {
        onNone: () => effect,
        onSome: (service) => service.withBufferedArchive(effect),
      }),
    ),
  );
