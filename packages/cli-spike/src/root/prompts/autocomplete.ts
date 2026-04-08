import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { CliPrompt, fromFlagOrPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

const timezoneValues = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
] as const;

const timezoneOptions = [
  { value: "America/New_York", label: "America/New_York (EST)" },
  { value: "America/Chicago", label: "America/Chicago (CST)" },
  { value: "America/Denver", label: "America/Denver (MST)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PST)" },
  { value: "Europe/London", label: "Europe/London (GMT)" },
  { value: "Europe/Paris", label: "Europe/Paris (CET)" },
  { value: "Europe/Berlin", label: "Europe/Berlin (CET)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (JST)" },
  { value: "Asia/Shanghai", label: "Asia/Shanghai (CST)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (AEST)" },
] as const;

const autocompleteConfig = {
  value: Flag.choice("value", timezoneValues).pipe(
    Flag.withDescription("Bypass the prompt with an explicit selection"),
    Flag.optional,
  ),
  "max-items": Flag.integer("max-items").pipe(
    Flag.withDescription("Maximum number of items to display"),
    Flag.optional,
  ),
  placeholder: Flag.string("placeholder").pipe(
    Flag.withDescription("Placeholder text shown when input is empty"),
    Flag.optional,
  ),
  "initial-input": Flag.string("initial-input").pipe(
    Flag.withDescription("Initial user input for filtering"),
    Flag.optional,
  ),
} as const;

const handleAutocomplete = (args: {
  readonly value: Option.Option<(typeof timezoneValues)[number]>;
  readonly maxItems: Option.Option<number>;
  readonly placeholder: Option.Option<string>;
  readonly initialInput: Option.Option<string>;
}) =>
  Effect.gen(function* () {
    const prompt = yield* CliPrompt;
    const renderer = yield* CliRenderer;
    const choice = yield* fromFlagOrPrompt(args.value, () =>
      prompt.autocomplete({
        message: "Select a timezone:",
        options: [...timezoneOptions],
        ...(Option.isSome(args.maxItems) && { maxItems: args.maxItems.value }),
        ...(Option.isSome(args.placeholder) && { placeholder: args.placeholder.value }),
        ...(Option.isSome(args.initialInput) && {
          initialUserInput: args.initialInput.value,
        }),
      }),
    );

    yield* renderer.success(`Selected: ${choice}`);
  });

export const autocompleteCommand = Command.make(
  "autocomplete",
  autocompleteConfig,
  ({ value, ["max-items"]: maxItems, placeholder, ["initial-input"]: initialInput }) =>
    handleAutocomplete({ value, maxItems, placeholder, initialInput }).pipe(
      withRuntime({ command: "prompts autocomplete" }),
    ),
).pipe(
  withArgvTracking(autocompleteConfig),
  Command.withDescription("Demo autocomplete prompt"),
  Command.withExamples([
    {
      command: "axm-spike prompts autocomplete",
      description: "Open the interactive autocomplete prompt",
    },
    {
      command: "axm-spike prompts autocomplete --value America/Chicago",
      description: "Resolve the autocomplete prompt non-interactively",
    },
  ]),
);
