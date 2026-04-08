import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { CliPrompt, fromFlagOrPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

const validateTextValue = (value: string | undefined): string | undefined =>
  value === undefined || value.length < 1 ? "Input must be at least 1 character" : undefined;

const textConfig = {
  value: Flag.string("value").pipe(
    Flag.withDescription("Bypass the prompt with an explicit value"),
    Flag.optional,
  ),
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

const handleText = (args: {
  readonly value: Option.Option<string>;
  readonly placeholder: Option.Option<string>;
  readonly defaultValue: Option.Option<string>;
  readonly initialValue: Option.Option<string>;
  readonly validate: boolean;
}) =>
  Effect.gen(function* () {
    const prompt = yield* CliPrompt;
    const renderer = yield* CliRenderer;
    const text = yield* fromFlagOrPrompt(args.value, () =>
      prompt.text({
        message: "Enter some text:",
        ...(Option.isSome(args.placeholder) && { placeholder: args.placeholder.value }),
        ...(Option.isSome(args.defaultValue) && { defaultValue: args.defaultValue.value }),
        ...(Option.isSome(args.initialValue) && { initialValue: args.initialValue.value }),
        ...(args.validate && { validate: validateTextValue }),
      }),
    );

    if (args.validate) {
      const validationError = validateTextValue(text);
      if (validationError !== undefined) {
        return yield* makeAppError({
          code: "PROMPT_VALUE_INVALID",
          what: validationError,
          howToFix: "Pass a non-empty `--value` or provide a non-empty prompt response.",
        });
      }
    }

    yield* renderer.success(`You entered: ${text}`);
  });

export const textCommand = Command.make(
  "text",
  textConfig,
  ({ value, placeholder, default: defaultValue, initial: initialValue, validate }) =>
    handleText({ value, placeholder, defaultValue, initialValue, validate }).pipe(
      withRuntime({ command: "prompts text" }),
    ),
).pipe(
  withArgvTracking(textConfig),
  Command.withDescription("Demo text input prompt"),
  Command.withExamples([
    {
      command: "axm-spike prompts text",
      description: "Open the interactive text prompt",
    },
    {
      command: "axm-spike prompts text --value hello",
      description: "Resolve the prompt non-interactively",
    },
  ]),
);
