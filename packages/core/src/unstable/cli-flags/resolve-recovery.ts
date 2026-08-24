/**
 * One-shot recovery-consent flag.
 *
 * A mutation-class invocation that detects live recovery state it cannot
 * safely restore automatically blocks `recovery-required` unless this flag
 * names the resolution: `restore` performs the verified restoration from the
 * capsule's snapshots; `accept` accepts the retained state as it stands. The
 * consent applies once, to the invocation that carries it.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Flag, GlobalFlag } from "effect/unstable/cli";

export type RecoveryConsent = "restore" | "accept";

export const resolveRecoveryFlag = GlobalFlag.setting("axm-resolve-recovery")({
  flag: Flag.string("resolve-recovery").pipe(
    Flag.withDescription(
      "Resolve detected recovery state before applying: restore (from snapshots) or accept (keep retained state)",
    ),
    Flag.optional,
  ),
});

/**
 * Reads the consent flag optionally so core operations inherit no
 * `GlobalFlag` requirement. A value other than the two consent forms is
 * surfaced as `invalid` so the caller can fail usage-clean.
 */
export const recoveryConsentOptional: Effect.Effect<
  RecoveryConsent | { readonly invalid: string } | undefined
> = Effect.gen(function* () {
  const raw = Option.flatten(yield* Effect.serviceOption(resolveRecoveryFlag));
  if (Option.isNone(raw)) return undefined;
  return raw.value === "restore" || raw.value === "accept" ? raw.value : { invalid: raw.value };
});
