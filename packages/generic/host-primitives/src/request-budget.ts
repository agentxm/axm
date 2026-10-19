/** Per-operation admission for outbound network requests. */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as RcMap from "effect/RcMap";
import * as Semaphore from "effect/Semaphore";
import type * as Scope from "effect/Scope";

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
    return {
      capacity: limits.invocation,
      withAttempt: (origin, effect) =>
        Effect.scoped(
          Effect.flatMap(RcMap.get(origins, origin), (originSemaphore) =>
            originSemaphore.withPermit(invocation.withPermit(effect)),
          ),
        ),
    } satisfies OperationRequestBudgetService;
  });
