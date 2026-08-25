/**
 * Command-completion hook.
 *
 * The runtime envelope owns completion telemetry (start time, dedupe, the
 * bounded send). A termination that must bypass the envelope's continuations —
 * an operation boundary dying inside its uninterruptible region while an
 * external interrupt is pending — records completion through this service
 * instead, so the event lands before the process exits on every path.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as ServiceMap from "effect/Context";

export interface CommandCompletionService {
  /** Record command completion for the given exit code, exactly once. */
  readonly record: (exitCode: number) => Effect.Effect<void>;
}

export class CommandCompletion extends ServiceMap.Service<
  CommandCompletion,
  CommandCompletionService
>()("@agentxm/client-core/unstable/cli-runtime/command-completion/CommandCompletion") {}

/** Record completion through the envelope's hook. No-op without one. */
export const recordCommandCompletion = (exitCode: number): Effect.Effect<void> =>
  Effect.gen(function* () {
    const service = yield* Effect.serviceOption(CommandCompletion);
    if (Option.isNone(service)) return;
    yield* service.value.record(exitCode);
  });
