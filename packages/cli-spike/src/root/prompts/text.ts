import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag, Prompt } from "effect/unstable/cli";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { requireInteractive } from "@agentxm/client-core/unstable/cli/prompt";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

const validatePetName = (value: string) =>
  value.length < 1 ? Effect.fail("Pet name must be at least 1 character") : Effect.succeed(value);

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
  validate: Flag.boolean("validate").pipe(
    Flag.withDescription("Enable sample length validator (min 1 char)"),
  ),
} as const;

const handleText = (args: {
  readonly value: Option.Option<string>;
  readonly placeholder: Option.Option<string>;
  readonly defaultValue: Option.Option<string>;
  readonly validate: boolean;
}) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const message = "Enter pet name:";
    const name = yield* Option.match(args.value, {
      onSome: Effect.succeed,
      onNone: () =>
        requireInteractive(
          Prompt.text({
            message,
            ...(Option.isSome(args.placeholder) && { placeholder: args.placeholder.value }),
            ...(Option.isSome(args.defaultValue) && { default: args.defaultValue.value }),
            ...(args.validate && { validate: validatePetName }),
          }),
          { message },
        ),
    });

    if (args.validate && Option.isSome(args.value) && name.length < 1) {
      return yield* makeAppError({
        code: "PROMPT_VALUE_INVALID",
        category: "validation",
        what: "Pet name must be at least 1 character",
        breadcrumbs: [
          {
            task: "Recover",
            description: "Pass a non-empty `--value` or provide a non-empty prompt response.",
          },
        ],
      });
    }

    yield* renderer.success(`You entered: ${name}`);
  });

export const textCommand = Command.make(
  "text",
  textConfig,
  ({ value, placeholder, default: defaultValue, validate }) =>
    handleText({ value, placeholder, defaultValue, validate }).pipe(withRuntime("prompts text")),
).pipe(
  withArgvTracking(textConfig),
  Command.withDescription("Demo text input prompt"),
  Command.withExamples([
    {
      command: "axm-spike prompts text",
      description: "Open the interactive text prompt for pet name entry",
    },
    {
      command: "axm-spike prompts text --value Mochi",
      description: "Resolve the prompt non-interactively with a pet name",
    },
  ]),
);
