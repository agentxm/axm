/**
 * The `--non-interactive` flag and the invocation posture it resolves to.
 *
 * Resolution chain: explicit --non-interactive flag → CI → stdin is not a TTY.
 * Prompt availability (`promptAvailability`) adds machine output on top; every
 * consumer that decides whether a person can be asked reads that resolution,
 * not this one.
 */

import * as Effect from "effect/Effect";
import type * as Config from "effect/Config";
import * as Option from "effect/Option";
import { Flag, GlobalFlag } from "effect/unstable/cli";
import { isCI } from "@agentxm/host-primitives";

/** Raw --non-interactive global flag; {@link isNonInteractive} resolves it with the environment. */
export const nonInteractiveFlag = GlobalFlag.Setting("axm-non-interactive")({
  flag: Flag.Boolean("non-interactive").pipe(
    Flag.optional,
    Flag.withDescription("Never prompt; fail with guidance when input is required"),
  ),
});

/**
 * Whether the invocation is non-interactive. An explicit flag wins in both
 * directions; otherwise CI or a stdin that is not a terminal makes it so. The
 * flag is read optionally so the resolution does not inherit a `GlobalFlag`
 * requirement: an absent flag falls back to environment detection exactly as
 * an unset flag would.
 */
export const isNonInteractive: Effect.Effect<boolean, Config.ConfigError> = Effect.gen(
  function* () {
    const explicit = Option.flatten(yield* Effect.serviceOption(nonInteractiveFlag));
    if (Option.isSome(explicit)) return explicit.value;
    const ci = yield* isCI;
    return ci || process.stdin.isTTY !== true;
  },
);
