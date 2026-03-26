import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { CliPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withRuntime } from "../../runtime.js";

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

export const autocompleteCommand = Command.make("autocomplete", autocompleteConfig, (config) =>
  withRuntime(
    Effect.gen(function* () {
      const prompt = yield* CliPrompt;
      const renderer = yield* CliRenderer;
      const choice = yield* prompt.autocomplete({
        message: "Select a timezone:",
        options: [...timezoneOptions],
        ...(Option.isSome(config["max-items"]) && { maxItems: config["max-items"].value }),
        ...(Option.isSome(config.placeholder) && { placeholder: config.placeholder.value }),
        ...(Option.isSome(config["initial-input"]) && {
          initialUserInput: config["initial-input"].value,
        }),
      });
      yield* renderer.success(`Selected: ${choice}`);
    }),
    { command: "prompts autocomplete" },
  ),
).pipe(Command.withDescription("Demo autocomplete prompt"));
