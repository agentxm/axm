import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { CliPrompt, fromFlagOrPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

const colorValues = ["red", "green", "blue", "yellow", "purple"] as const;

const colorOptions = [
  { value: "red", label: "Red", hint: "Primary color" },
  { value: "green", label: "Green", hint: "Secondary color" },
  { value: "blue", label: "Blue", hint: "Primary color" },
  { value: "yellow", label: "Yellow", hint: "Warm color" },
  { value: "purple", label: "Purple", hint: "Cool color" },
] as const;

const selectConfig = {
  value: Flag.choice("value", colorValues).pipe(
    Flag.withDescription("Bypass the prompt with an explicit selection"),
    Flag.optional,
  ),
  "max-items": Flag.integer("max-items").pipe(
    Flag.withDescription("Maximum number of items to display"),
    Flag.optional,
  ),
  initial: Flag.choice("initial", colorValues).pipe(
    Flag.withDescription("Initial selected value"),
    Flag.optional,
  ),
} as const;

const handleSelect = (args: {
  readonly value: Option.Option<(typeof colorValues)[number]>;
  readonly maxItems: Option.Option<number>;
  readonly initial: Option.Option<(typeof colorValues)[number]>;
}) =>
  Effect.gen(function* () {
    const prompt = yield* CliPrompt;
    const renderer = yield* CliRenderer;
    const choice = yield* fromFlagOrPrompt(args.value, () =>
      prompt.select({
        message: "Pick a color:",
        options: [...colorOptions],
        ...(Option.isSome(args.maxItems) && { maxItems: args.maxItems.value }),
        ...(Option.isSome(args.initial) && { initialValue: args.initial.value }),
      }),
    );

    yield* renderer.success(`You picked: ${choice}`);
  });

export const selectCommand = Command.make(
  "select",
  selectConfig,
  ({ value, ["max-items"]: maxItems, initial }) =>
    handleSelect({ value, maxItems, initial }).pipe(withRuntime({ command: "prompts select" })),
).pipe(
  withArgvTracking(selectConfig),
  Command.withDescription("Demo select prompt"),
  Command.withExamples([
    {
      command: "axm-spike prompts select",
      description: "Open the interactive select prompt",
    },
    {
      command: "axm-spike prompts select --value red",
      description: "Resolve the select prompt non-interactively",
    },
  ]),
);
