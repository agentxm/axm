import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag, Prompt } from "effect/unstable/cli";

import { requireInteractive } from "@axm.sh/core/unstable/cli/prompt";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

const speciesValues = ["cat", "dog", "rabbit", "bird", "hamster"] as const;

const speciesChoices = [
  { title: "Cat", value: "cat" as const, description: "Independent and curious" },
  { title: "Dog", value: "dog" as const, description: "Loyal and playful" },
  { title: "Rabbit", value: "rabbit" as const, description: "Gentle and quiet" },
  { title: "Bird", value: "bird" as const, description: "Colorful and vocal" },
  { title: "Hamster", value: "hamster" as const, description: "Small and active" },
];

const selectConfig = {
  value: Flag.choice("value", speciesValues).pipe(
    Flag.withDescription("Bypass the prompt with an explicit selection"),
    Flag.optional,
  ),
  "max-items": Flag.integer("max-items").pipe(
    Flag.withDescription("Maximum number of items to display per page"),
    Flag.optional,
  ),
  initial: Flag.choice("initial", speciesValues).pipe(
    Flag.withDescription("Initial selected value"),
    Flag.optional,
  ),
} as const;

const handleSelect = (args: {
  readonly value: Option.Option<(typeof speciesValues)[number]>;
  readonly maxItems: Option.Option<number>;
  readonly initial: Option.Option<(typeof speciesValues)[number]>;
}) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const message = "Pick a species:";
    const choice = yield* Option.match(args.value, {
      onSome: Effect.succeed,
      onNone: () =>
        requireInteractive(
          Prompt.select({
            message,
            choices: speciesChoices.map((c) => ({
              ...c,
              ...(Option.isSome(args.initial) &&
                c.value === args.initial.value && { selected: true }),
            })),
            ...(Option.isSome(args.maxItems) && { maxPerPage: args.maxItems.value }),
          }),
          { message },
        ),
    });

    yield* renderer.success(`You picked: ${choice}`);
  });

export const selectCommand = Command.make(
  "select",
  selectConfig,
  ({ value, ["max-items"]: maxItems, initial }) =>
    handleSelect({ value, maxItems, initial }).pipe(withRuntime("prompts select")),
).pipe(
  withArgvTracking(selectConfig),
  Command.withDescription("Demo select prompt"),
  Command.withExamples([
    {
      command: "axm-spike prompts select",
      description: "Open the interactive species selection prompt",
    },
    {
      command: "axm-spike prompts select --value cat",
      description: "Select a species non-interactively",
    },
  ]),
);
