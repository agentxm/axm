/**
 * Effective prompt availability.
 *
 * A prompt may open only when the invocation is interactive — the explicit
 * `--non-interactive` flag wins over `CI` and stdin detection in both
 * directions — and machine output is off. Machine output is an absolute
 * prohibition: a JSON invocation never prompts even from a terminal or with
 * an explicit interaction flag. Every consumer that decides whether to ask,
 * block, or fall back reads this one resolution so planning, approval, and
 * the screen agree.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { jsonFlag } from "./json-flag.js";
import { isNonInteractiveOptional } from "./non-interactive.js";

export const isMachineOutput: Effect.Effect<boolean> = Effect.map(
  Effect.serviceOption(jsonFlag),
  (json) => Option.exists(Option.flatten(json), Boolean),
);

/** Whether an interactive prompt can open in this invocation. */
export const promptAvailability: Effect.Effect<boolean> = Effect.gen(function* () {
  const nonInteractive = yield* isNonInteractiveOptional;
  const machine = yield* isMachineOutput;
  return !nonInteractive && !machine;
});
