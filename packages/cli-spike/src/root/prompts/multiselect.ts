import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { CliPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withRuntime } from "../../runtime.js";

const fruitOptions = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry" },
  { value: "date", label: "Date" },
  { value: "elderberry", label: "Elderberry" },
] as const;

const multiselectConfig = {
  "max-items": Flag.integer("max-items").pipe(
    Flag.withDescription("Maximum number of items to display"),
    Flag.optional,
  ),
  required: Flag.boolean("required").pipe(
    Flag.withDescription("Require at least one selection"),
  ),
  "cursor-at": Flag.string("cursor-at").pipe(
    Flag.withDescription("Initial cursor position (value)"),
    Flag.optional,
  ),
} as const;

export const multiselectCommand = Command.make("multiselect", multiselectConfig, (config) =>
  withRuntime(
    Effect.gen(function* () {
      const prompt = yield* CliPrompt;
      const renderer = yield* CliRenderer;
      const choices = yield* prompt.multiselect({
        message: "Pick your favorite fruits:",
        options: [...fruitOptions],
        ...(Option.isSome(config["max-items"]) && { maxItems: config["max-items"].value }),
        ...(config.required && { required: true }),
        ...(Option.isSome(config["cursor-at"]) && { cursorAt: config["cursor-at"].value }),
      });
      yield* renderer.success(`You picked: ${choices.join(", ")}`);
    }),
    { command: "prompts multiselect" },
  ),
).pipe(Command.withDescription("Demo multiselect prompt"));
