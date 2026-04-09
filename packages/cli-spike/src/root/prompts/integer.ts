import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag, Prompt } from "effect/unstable/cli";

import { requireInteractive } from "@axm.sh/core/unstable/cli/prompt";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

const integerConfig = {
  value: Flag.integer("value").pipe(
    Flag.withDescription("Bypass the prompt with an explicit integer value"),
    Flag.optional,
  ),
} as const;

const handleInteger = (args: { readonly value: Option.Option<number> }) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const message = "Pet age in months:";
    const age = yield* Option.match(args.value, {
      onSome: Effect.succeed,
      onNone: () =>
        requireInteractive(
          Prompt.integer({
            message,
            min: 1,
            max: 360,
          }),
          { message },
        ),
    });

    yield* renderer.success(`Pet age: ${String(age)} months`);
  });

export const integerCommand = Command.make("integer", integerConfig, ({ value }) =>
  handleInteger({ value }).pipe(withRuntime("prompts integer")),
).pipe(
  withArgvTracking(integerConfig),
  Command.withDescription("Demo integer input prompt"),
  Command.withExamples([
    {
      command: "axm-spike prompts integer",
      description: "Open the interactive integer prompt for pet age",
    },
    {
      command: "axm-spike prompts integer --value 24",
      description: "Resolve the prompt non-interactively with a pet age",
    },
  ]),
);
