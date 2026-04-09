import * as Effect from "effect/Effect";
import { Command, Flag } from "effect/unstable/cli";

import { AxmPrompt } from "@axm.sh/core/unstable/cli/prompt";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { fromValuesOrInteractivePrompt } from "./helpers.js";
import { withRuntime } from "../../runtime.js";

const vetServiceValues = [
  "vaccination",
  "microchip",
  "dental",
  "bloodwork",
  "xray",
  "flea",
  "deworm",
  "spay-neuter",
] as const;

const vetServiceChoices = [
  { title: "Vaccination", value: "vaccination" as const, description: "Core vaccines" },
  { title: "Microchipping", value: "microchip" as const, description: "ID chip implant" },
  { title: "Dental Cleaning", value: "dental" as const, description: "Teeth cleaning" },
  { title: "Blood Work", value: "bloodwork" as const, description: "Lab panel" },
  { title: "X-Ray", value: "xray" as const, description: "Diagnostic imaging" },
  { title: "Flea Treatment", value: "flea" as const, description: "Parasite prevention" },
  { title: "Deworming", value: "deworm" as const, description: "Internal parasites" },
  { title: "Spay/Neuter", value: "spay-neuter" as const, description: "Surgical procedure" },
] as const;

const autocompleteMultiselectConfig = {
  value: Flag.choice("value", vetServiceValues).pipe(
    Flag.withDescription("Bypass the prompt with explicit selections"),
    Flag.atLeast(0),
  ),
  required: Flag.boolean("required").pipe(Flag.withDescription("Require at least one selection")),
} as const;

const handleAutocompleteMultiselect = (args: {
  readonly value: ReadonlyArray<(typeof vetServiceValues)[number]>;
  readonly required: boolean;
}) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const message = "Select veterinary services:";
    const choices = yield* fromValuesOrInteractivePrompt(
      args.value,
      AxmPrompt.autocompleteMultiselect({
        message,
        choices: [...vetServiceChoices],
        ...(args.required && { min: 1 }),
      }),
      { message },
    );

    yield* renderer.success(`Selected: ${choices.length === 0 ? "(none)" : choices.join(", ")}`);
  });

export const autocompleteMultiselectCommand = Command.make(
  "autocomplete-multiselect",
  autocompleteMultiselectConfig,
  ({ value, required }) =>
    handleAutocompleteMultiselect({ value, required }).pipe(
      withRuntime("prompts autocomplete-multiselect"),
    ),
).pipe(
  withArgvTracking(autocompleteMultiselectConfig),
  Command.withDescription("Demo autocomplete multiselect prompt"),
  Command.withExamples([
    {
      command: "axm-spike prompts autocomplete-multiselect",
      description: "Open the interactive autocomplete multiselect prompt",
    },
    {
      command: "axm-spike prompts autocomplete-multiselect --value vaccination --value dental",
      description: "Resolve the autocomplete multiselect prompt non-interactively",
    },
  ]),
);
