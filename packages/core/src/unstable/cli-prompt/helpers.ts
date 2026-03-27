import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { PromptCancelled } from "./prompt-cancelled.js";

/**
 * If `value` is Some, return it directly. Otherwise, run the prompt to get it.
 * Useful for commands where a flag can supply a value or the user is prompted.
 */
export const fromFlagOrPrompt = <T>(
  value: Option.Option<T>,
  prompt: () => Effect.Effect<T, PromptCancelled>,
) => Option.match(value, { onNone: prompt, onSome: (v) => Effect.succeed(v) });

/**
 * If `yes` is true, return true immediately (auto-confirm).
 * Otherwise, run the confirmation prompt.
 */
export const autoConfirm = (yes: boolean, prompt: () => Effect.Effect<boolean, PromptCancelled>) =>
  yes ? Effect.succeed(true) : prompt();
