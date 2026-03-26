import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { CliPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withRuntime } from "../../runtime.js";

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
  "max-items": Flag.integer("max-items").pipe(
    Flag.withDescription("Maximum number of items to display"),
    Flag.optional,
  ),
  required: Flag.boolean("required").pipe(
    Flag.withDescription("Require at least one selection"),
  ),
} as const;

export const autocompleteMultiselectCommand = Command.make(
  "autocomplete-multiselect",
  autocompleteMultiselectConfig,
  (config) =>
    withRuntime(
      Effect.gen(function* () {
        const prompt = yield* CliPrompt;
        const renderer = yield* CliRenderer;
        const choices = yield* prompt.autocompleteMultiselect({
          message: "Select dependencies to install:",
          options: [...packageOptions],
          ...(Option.isSome(config["max-items"]) && { maxItems: config["max-items"].value }),
          ...(config.required && { required: true }),
        });
        yield* renderer.success(`Selected: ${choices.join(", ")}`);
      }),
      { command: "prompts autocomplete-multiselect" },
    ),
).pipe(Command.withDescription("Demo autocomplete multiselect prompt"));
