/**
 * Lockfile read tolerance policy.
 *
 * A corrupt `axm-lock.yaml` is a recoverable condition, not a terminal one:
 * reconciliation backs the bad file up and regenerates it. For that recovery to
 * be reachable, every read taken *before* reconciliation runs — source
 * resolution, discovery, plan building — has to survive the decode failure.
 *
 * Rather than guarding each of those call sites individually, tolerance is a
 * context-scoped policy. Under `"degrade"`, a lockfile that fails to parse or
 * decode reads as absent, exactly as a missing lockfile would. Under `"strict"`
 * (the default, and what library consumers get) the failure propagates.
 *
 * `WorkspaceMutations.getLockfileState` deliberately pins itself to `"strict"`
 * so reconciliation still distinguishes `invalid` from `missing` and still
 * warns, backs up, and regenerates.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";

/** How lockfile parse/decode failures are treated by the workspace read model. */
export type LockfileReadTolerance = "strict" | "degrade";

/**
 * Context reference carrying the active {@link LockfileReadTolerance}.
 *
 * Defaults to `"strict"`; the AXM CLI opts every command into `"degrade"` at
 * its workspace boundary.
 */
export const LockfileReadToleranceRef = ServiceMap.Reference<LockfileReadTolerance>(
  "@agentxm/client-core/unstable/workspace/LockfileReadTolerance",
  { defaultValue: (): LockfileReadTolerance => "strict" },
);

/** Run `effect` with lockfile parse/decode failures degraded to "absent". */
export const withDegradedLockfileReads = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> => Effect.provideService(effect, LockfileReadToleranceRef, "degrade");

/** Run `effect` with lockfile parse/decode failures propagated, ignoring any ambient tolerance. */
export const withStrictLockfileReads = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> => Effect.provideService(effect, LockfileReadToleranceRef, "strict");
