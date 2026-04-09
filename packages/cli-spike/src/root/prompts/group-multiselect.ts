import * as Effect from "effect/Effect";
import { Command, Flag } from "effect/unstable/cli";

import { AxmPrompt, requireInteractive } from "@axm.sh/core/unstable/cli/prompt";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

const serviceValues = [
  "vaccination",
  "microchip",
  "spay-neuter",
  "bath",
  "nails",
  "obedience",
  "socialization",
] as const;

const makeServiceGroups = (selectableGroups: boolean) => [
  {
    label: "Medical",
    selectableHeader: selectableGroups,
    choices: [
      { title: "Vaccination", value: "vaccination" as const },
      { title: "Microchipping", value: "microchip" as const },
      { title: "Spay/Neuter", value: "spay-neuter" as const },
    ],
  },
  {
    label: "Grooming",
    selectableHeader: selectableGroups,
    choices: [
      { title: "Bath & Brush", value: "bath" as const },
      { title: "Nail Trim", value: "nails" as const },
    ],
  },
  {
    label: "Training",
    selectableHeader: selectableGroups,
    choices: [
      { title: "Basic Obedience", value: "obedience" as const },
      { title: "Socialization", value: "socialization" as const },
    ],
  },
];

const groupMultiselectConfig = {
  value: Flag.choice("value", serviceValues).pipe(
    Flag.withDescription("Bypass the prompt with explicit selections"),
    Flag.atLeast(0),
  ),
  "selectable-groups": Flag.boolean("selectable-groups").pipe(
    Flag.withDescription("Allow selecting entire groups at once"),
  ),
  required: Flag.boolean("required").pipe(Flag.withDescription("Require at least one selection")),
} as const;

const handleGroupMultiselect = (args: {
  readonly value: ReadonlyArray<(typeof serviceValues)[number]>;
  readonly selectableGroups: boolean;
  readonly required: boolean;
}) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const message = "Select pet services:";
    const choices =
      args.value.length > 0
        ? args.value
        : yield* requireInteractive(
            AxmPrompt.groupMultiselect({
              message,
              groups: makeServiceGroups(args.selectableGroups),
              ...(args.required && { min: 1 }),
            }),
            { message },
          );

    yield* renderer.success(`Selected: ${choices.length === 0 ? "(none)" : choices.join(", ")}`);
  });

export const groupMultiselectCommand = Command.make(
  "group-multiselect",
  groupMultiselectConfig,
  ({ value, ["selectable-groups"]: selectableGroups, required }) =>
    handleGroupMultiselect({ value, selectableGroups, required }).pipe(
      withRuntime("prompts group-multiselect"),
    ),
).pipe(
  withArgvTracking(groupMultiselectConfig),
  Command.withDescription("Demo group multiselect prompt"),
  Command.withExamples([
    {
      command: "axm-spike prompts group-multiselect",
      description: "Open the interactive grouped multiselect prompt",
    },
    {
      command: "axm-spike prompts group-multiselect --value vaccination --value bath",
      description: "Resolve the grouped prompt non-interactively",
    },
  ]),
);
