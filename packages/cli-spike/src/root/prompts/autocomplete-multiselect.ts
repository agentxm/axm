import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { CliPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

const packageValues = [
  "effect",
  "typescript",
  "vitest",
  "eslint",
  "prettier",
  "tsx",
  "zod",
  "react",
] as const;

const packageOptions = [
  { value: "effect", label: "effect", hint: "Core functional library" },
  { value: "typescript", label: "typescript", hint: "TypeScript compiler" },
  { value: "vitest", label: "vitest", hint: "Test framework" },
  { value: "eslint", label: "eslint", hint: "Linter" },
  { value: "prettier", label: "prettier", hint: "Code formatter" },
  { value: "tsx", label: "tsx", hint: "TypeScript executor" },
  { value: "zod", label: "zod", hint: "Schema validation" },
  { value: "react", label: "react", hint: "UI library" },
] as const;

const autocompleteMultiselectConfig = {
  value: Flag.choice("value", packageValues).pipe(
    Flag.withDescription("Bypass the prompt with explicit selections"),
    Flag.atLeast(0),
  ),
  "max-items": Flag.integer("max-items").pipe(
    Flag.withDescription("Maximum number of items to display"),
    Flag.optional,
  ),
  required: Flag.boolean("required").pipe(Flag.withDescription("Require at least one selection")),
} as const;

const handleAutocompleteMultiselect = (args: {
  readonly value: ReadonlyArray<(typeof packageValues)[number]>;
  readonly maxItems: Option.Option<number>;
  readonly required: boolean;
}) =>
  Effect.gen(function* () {
    const prompt = yield* CliPrompt;
    const renderer = yield* CliRenderer;
    const choices =
      args.value.length > 0
        ? args.value
        : yield* prompt.autocompleteMultiselect({
            message: "Select dependencies to install:",
            options: [...packageOptions],
            ...(Option.isSome(args.maxItems) && { maxItems: args.maxItems.value }),
            ...(args.required && { required: true }),
          });

    yield* renderer.success(`Selected: ${choices.length === 0 ? "(none)" : choices.join(", ")}`);
  });

export const autocompleteMultiselectCommand = Command.make(
  "autocomplete-multiselect",
  autocompleteMultiselectConfig,
  ({ value, ["max-items"]: maxItems, required }) =>
    handleAutocompleteMultiselect({ value, maxItems, required }).pipe(
      withRuntime({ command: "prompts autocomplete-multiselect" }),
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
      command: "axm-spike prompts autocomplete-multiselect --value effect --value vitest",
      description: "Resolve the autocomplete multiselect prompt non-interactively",
    },
  ]),
);
