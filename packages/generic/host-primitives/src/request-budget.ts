/** Per-operation admission for outbound network requests. */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Cause from "effect/Cause";
import * as Exit from "effect/Exit";
import * as RcMap from "effect/RcMap";
import * as Semaphore from "effect/Semaphore";
import type * as Scope from "effect/Scope";
import { captureWork } from "./work-observation.js";

export interface OperationRequestBudgetService {
  readonly capacity: number;
  readonly withAttempt: <A, E, R>(
    origin: string,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
}

/**
 * Request admission shared by every outbound request in one CLI operation —
 * Registry reads and downloads and Git transfers — bounded per invocation and
 * per origin.
 */
export class OperationRequestBudget extends ServiceMap.Service<
  OperationRequestBudget,
  OperationRequestBudgetService
>()("@agentxm/host-primitives/OperationRequestBudget") {}

export const makeOperationRequestBudget = (limits: {
  readonly invocation: number;
  readonly origin: number;
}): Effect.Effect<OperationRequestBudgetService, never, Scope.Scope> =>
  Effect.gen(function* () {
    if (
      !Number.isSafeInteger(limits.invocation) ||
      limits.invocation < 1 ||
      !Number.isSafeInteger(limits.origin) ||
      limits.origin < 1
    ) {
      return yield* Effect.die(new Error("Request limits must be positive finite integers"));
    }
    const invocation = yield* Semaphore.make(limits.invocation);
    // Borrow before waiting: the last active request cannot retire an origin
    // while another request for that origin is queued for its permit.
    const origins = yield* RcMap.make({
      lookup: (_origin: string) => Semaphore.make(limits.origin),
    });
    const admitted = <A, E, R>(
      semaphore: Semaphore.Semaphore,
      kind: "axm.admission.request-origin" | "axm.admission.request-invocation",
      capacity: number,
      effect: Effect.Effect<A, E, R>,
    ) =>
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const capture = yield* captureWork;
          const admission = capture?.begin(kind, {
            attributes: { "axm.admission.capacity": capacity, "axm.admission.unit": "permits" },
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
      );
    return {
      capacity: limits.invocation,
      withAttempt: (origin, effect) =>
        Effect.scoped(
          Effect.flatMap(RcMap.get(origins, origin), (originSemaphore) =>
            admitted(
              originSemaphore,
              "axm.admission.request-origin",
              limits.origin,
              admitted(invocation, "axm.admission.request-invocation", limits.invocation, effect),
            ),
          ),
        ),
    } satisfies OperationRequestBudgetService;
  });
