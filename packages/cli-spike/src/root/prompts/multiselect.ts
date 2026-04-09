import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag, Prompt } from "effect/unstable/cli";

import { requireInteractive } from "@axm.sh/core/unstable/cli/prompt";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

const careValues = [
  "vaccination",
  "microchip",
  "spay-neuter",
  "flea-treatment",
  "deworming",
] as const;

const careChoices = [
  { title: "Vaccination", value: "vaccination" as const, description: "Core vaccines up to date" },
  { title: "Microchip", value: "microchip" as const, description: "Implant identification chip" },
  { title: "Spay/Neuter", value: "spay-neuter" as const, description: "Surgical sterilization" },
  {
    title: "Flea Treatment",
    value: "flea-treatment" as const,
    description: "Topical or oral flea prevention",
  },
  { title: "Deworming", value: "deworming" as const, description: "Internal parasite treatment" },
];

const multiselectConfig = {
  value: Flag.choice("value", careValues).pipe(
    Flag.withDescription("Bypass the prompt with explicit selections"),
    Flag.atLeast(0),
  ),
  "max-items": Flag.integer("max-items").pipe(
    Flag.withDescription("Maximum number of items to display per page"),
    Flag.optional,
  ),
  required: Flag.boolean("required").pipe(Flag.withDescription("Require at least one selection")),
} as const;

const handleMultiselect = (args: {
  readonly value: ReadonlyArray<(typeof careValues)[number]>;
  readonly maxItems: Option.Option<number>;
  readonly required: boolean;
}) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const message = "Select care requirements:";
    const choices =
      args.value.length > 0
        ? args.value
        : yield* requireInteractive(
            Prompt.multiSelect({
              message,
              choices: careChoices,
              ...(Option.isSome(args.maxItems) && { maxPerPage: args.maxItems.value }),
              ...(args.required && { min: 1 }),
            }),
            { message },
          );

    yield* renderer.success(`You picked: ${choices.length === 0 ? "(none)" : choices.join(", ")}`);
  });

export const multiselectCommand = Command.make(
  "multiselect",
  multiselectConfig,
  ({ value, ["max-items"]: maxItems, required }) =>
    handleMultiselect({ value, maxItems, required }).pipe(withRuntime("prompts multiselect")),
).pipe(
  withArgvTracking(multiselectConfig),
  Command.withDescription("Demo multiselect prompt"),
  Command.withExamples([
    {
      command: "axm-spike prompts multiselect",
      description: "Open the interactive care requirements prompt",
    },
    {
      command: "axm-spike prompts multiselect --value vaccination --value microchip",
      description: "Select care requirements non-interactively",
    },
  ]),
);
