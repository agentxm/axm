/**
 * Non-interactive flag and resolution — CLI-specific environment detection.
 *
 * Resolution chain: explicit --non-interactive flag → CI=true env var → stdin is not a TTY.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Flag, GlobalFlag } from "effect/unstable/cli";
import { envOption } from "../utils/environment.js";

/** Returns true if CI env var is set. */
export const isCI: Effect.Effect<boolean> = Effect.map(envOption("CI"), (value) =>
  Option.exists(value, (raw) => raw.length > 0 && raw !== "0" && raw.toLowerCase() !== "false"),
);

/**
 * Raw --non-interactive global flag. Callers should use {@link isNonInteractive}
 * as the source of truth for interactivity — it combines this flag with
 * environment detection (CI, TTY).
 */
export const nonInteractiveFlag = GlobalFlag.setting("axm-non-interactive")({
  flag: Flag.boolean("non-interactive").pipe(
    Flag.optional,
    Flag.withDescription("Disable all interactive prompts"),
  ),
});

/**
 * Returns true when the process should suppress interactive prompts.
 *
 * Resolution chain: explicit --non-interactive flag → CI=true env var → stdin is not a TTY.
 * When the flag is explicitly set, it wins. Environment detection is the fallback.
 */
export const isNonInteractive = Effect.gen(function* () {
  const flag = yield* nonInteractiveFlag;
  const ci = yield* isCI;
  return Option.getOrElse(flag, () => ci || process.stdin.isTTY !== true);
});

/**
 * Same resolution as {@link isNonInteractive}, but reads the global flag
 * optionally so the caller does not inherit a `GlobalFlag` requirement. Use
 * this from core operations that run both under the CLI runtime and from
 * tests that provide no flag layer; an absent flag falls back to environment
 * detection exactly as an unset flag would.
 */
export const isNonInteractiveOptional: Effect.Effect<boolean> = Effect.gen(function* () {
  const explicit = Option.flatten(yield* Effect.serviceOption(nonInteractiveFlag));
  const ci = yield* isCI;
  return Option.getOrElse(explicit, () => ci || process.stdin.isTTY !== true);
});
