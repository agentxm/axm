import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Flag, GlobalFlag } from "effect/unstable/cli";

/**
 * Global flag for --non-interactive. Parsed at the root command level.
 */
export const nonInteractiveFlag = GlobalFlag.setting("axm-non-interactive")({
  flag: Flag.boolean("non-interactive").pipe(
    Flag.optional,
    Flag.withDescription("Disable all interactive prompts"),
  ),
});

/**
 * Returns true when the environment indicates CI (commonly via CI=true).
 */
export const isCI = (): boolean => process.env["CI"] === "true";

/**
 * Resolution chain: explicit --non-interactive flag -> CI=true -> !stdin.isTTY
 */
export const resolveNonInteractive = Effect.gen(function* () {
  const flag = yield* nonInteractiveFlag;
  return Option.getOrElse(flag, () => isCI() || process.stdin.isTTY !== true);
});
