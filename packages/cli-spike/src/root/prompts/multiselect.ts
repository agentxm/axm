import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { CliPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

const fruitValues = ["apple", "banana", "cherry", "date", "elderberry"] as const;

const fruitOptions = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry" },
  { value: "date", label: "Date" },
  { value: "elderberry", label: "Elderberry" },
] as const;

const multiselectConfig = {
  value: Flag.choice("value", fruitValues).pipe(
    Flag.withDescription("Bypass the prompt with explicit selections"),
    Flag.atLeast(0),
  ),
  "max-items": Flag.integer("max-items").pipe(
    Flag.withDescription("Maximum number of items to display"),
    Flag.optional,
  ),
  required: Flag.boolean("required").pipe(Flag.withDescription("Require at least one selection")),
  "cursor-at": Flag.choice("cursor-at", fruitValues).pipe(
    Flag.withDescription("Initial cursor position (value)"),
    Flag.optional,
  ),
} as const;

const handleMultiselect = (args: {
  readonly value: ReadonlyArray<(typeof fruitValues)[number]>;
  readonly maxItems: Option.Option<number>;
  readonly required: boolean;
  readonly cursorAt: Option.Option<(typeof fruitValues)[number]>;
}) =>
  Effect.gen(function* () {
    const prompt = yield* CliPrompt;
    const renderer = yield* CliRenderer;
    const choices =
      args.value.length > 0
        ? args.value
        : yield* prompt.multiselect({
            message: "Pick your favorite fruits:",
            options: [...fruitOptions],
            ...(Option.isSome(args.maxItems) && { maxItems: args.maxItems.value }),
            ...(args.required && { required: true }),
            ...(Option.isSome(args.cursorAt) && { cursorAt: args.cursorAt.value }),
          });

    yield* renderer.success(`You picked: ${choices.length === 0 ? "(none)" : choices.join(", ")}`);
  });

export const multiselectCommand = Command.make(
  "multiselect",
  multiselectConfig,
  ({ value, ["max-items"]: maxItems, required, ["cursor-at"]: cursorAt }) =>
    handleMultiselect({ value, maxItems, required, cursorAt }).pipe(
      withRuntime({ command: "prompts multiselect" }),
    ),
).pipe(
  withArgvTracking(multiselectConfig),
  Command.withDescription("Demo multiselect prompt"),
  Command.withExamples([
    {
      command: "axm-spike prompts multiselect",
      description: "Open the interactive multiselect prompt",
    },
    {
      command: "axm-spike prompts multiselect --value apple --value banana",
      description: "Resolve the multiselect prompt non-interactively",
    },
  ]),
);
