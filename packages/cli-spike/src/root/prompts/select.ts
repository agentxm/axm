import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { CliPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withRuntime } from "../../runtime.js";

const colorOptions = [
  { value: "red", label: "Red", hint: "Primary color" },
  { value: "green", label: "Green", hint: "Secondary color" },
  { value: "blue", label: "Blue", hint: "Primary color" },
  { value: "yellow", label: "Yellow", hint: "Warm color" },
  { value: "purple", label: "Purple", hint: "Cool color" },
] as const;

const selectConfig = {
  "max-items": Flag.integer("max-items").pipe(
    Flag.withDescription("Maximum number of items to display"),
    Flag.optional,
  ),
  initial: Flag.string("initial").pipe(
    Flag.withDescription("Initial selected value"),
    Flag.optional,
  ),
} as const;

export const selectCommand = Command.make("select", selectConfig, (config) =>
  withRuntime(
    Effect.gen(function* () {
      const prompt = yield* CliPrompt;
      const renderer = yield* CliRenderer;
      const choice = yield* prompt.select({
        message: "Pick a color:",
        options: [...colorOptions],
        initialValue: "red",
        ...(Option.isSome(config["max-items"]) && { maxItems: config["max-items"].value }),
      });
      yield* renderer.success(`You picked: ${choice}`);
    }),
    { command: "prompts select" },
  ),
).pipe(Command.withDescription("Demo select prompt"));
