import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { CliPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withRuntime } from "../../runtime.js";

const textConfig = {
  placeholder: Flag.string("placeholder").pipe(
    Flag.withDescription("Placeholder text shown when input is empty"),
    Flag.optional,
  ),
  default: Flag.string("default").pipe(
    Flag.withDescription("Default value if no input is provided"),
    Flag.optional,
  ),
  initial: Flag.string("initial").pipe(
    Flag.withDescription("Initial value pre-filled in the input"),
    Flag.optional,
  ),
  validate: Flag.boolean("validate").pipe(
    Flag.withDescription("Enable sample length validator (min 1 char)"),
  ),
} as const;

export const textCommand = Command.make("text", textConfig, (config) =>
  withRuntime(
    Effect.gen(function* () {
      const prompt = yield* CliPrompt;
      const renderer = yield* CliRenderer;
      const name = yield* prompt.text({
        message: "Enter some text:",
        ...(Option.isSome(config.placeholder) && { placeholder: config.placeholder.value }),
        ...(Option.isSome(config.default) && { defaultValue: config.default.value }),
        ...(Option.isSome(config.initial) && { initialValue: config.initial.value }),
        ...(config.validate && {
          validate: (value: string | undefined) =>
            value === undefined || value.length < 1
              ? "Input must be at least 1 character"
              : undefined,
        }),
      });
      yield* renderer.success(`You entered: ${name}`);
    }),
    { command: "prompts text" },
  ),
).pipe(Command.withDescription("Demo text input prompt"));
