import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliPrompt } from "../cli-prompt/cli-prompt.js";
import { Input } from "./input.js";

/**
 * Adapter layer that implements `Input` by delegating to `CliPrompt`.
 *
 * The config types are structurally identical between Input and CliPrompt
 * (TextConfig ≡ TextOpts, etc.), so calls pass through directly.
 *
 * Error widening: CliPrompt returns `Effect<T, PromptCancelled>` while
 * Input returns `Effect<T, AppError | PromptCancelled>`. Since PromptCancelled
 * is a subtype of the union, the assignment is type-safe without explicit mapping.
 *
 * This is a temporary bridge during migration — once all handlers use
 * CliPrompt directly, this adapter and the Input service will be removed.
 */
export const InputAdapter: Layer.Layer<Input, never, CliPrompt> = Layer.effect(
  Input,
  Effect.gen(function* () {
    const prompt = yield* CliPrompt;
    return {
      text: (config) => prompt.text(config),
      password: (config) => prompt.password(config),
      confirm: (config) => prompt.confirm(config),
      select: (config) => prompt.select(config),
      multiselect: (config) => prompt.multiselect(config),
      groupMultiselect: (config) => prompt.groupMultiselect(config),
      selectKey: (config) => prompt.selectKey(config),
      autocomplete: (config) => prompt.autocomplete(config),
      autocompleteMultiselect: (config) => prompt.autocompleteMultiselect(config),
      path: (config) => prompt.path(config),
    };
  }),
);
