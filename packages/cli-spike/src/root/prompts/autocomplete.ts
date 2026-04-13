import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag, Prompt } from "effect/unstable/cli";

import { requireInteractive } from "@agentxm/client-core/unstable/cli/prompt";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

const petNameValues = [
  "Mochi",
  "Juniper",
  "Luna",
  "Biscuit",
  "Pepper",
  "Maple",
  "Clover",
  "Jasper",
  "Willow",
  "Ziggy",
] as const;

const petNameChoices = [
  { title: "Mochi", value: "Mochi" as const, description: "Playful calico cat" },
  { title: "Juniper", value: "Juniper" as const, description: "Adventurous tabby" },
  { title: "Luna", value: "Luna" as const, description: "Gentle black lab" },
  { title: "Biscuit", value: "Biscuit" as const, description: "Fluffy golden retriever" },
  { title: "Pepper", value: "Pepper" as const, description: "Energetic border collie" },
  { title: "Maple", value: "Maple" as const, description: "Curious Holland lop rabbit" },
  { title: "Clover", value: "Clover" as const, description: "Friendly mini rex rabbit" },
  { title: "Jasper", value: "Jasper" as const, description: "Talkative cockatiel" },
  { title: "Willow", value: "Willow" as const, description: "Calm Syrian hamster" },
  { title: "Ziggy", value: "Ziggy" as const, description: "Active dwarf hamster" },
];

const autocompleteConfig = {
  value: Flag.choice("value", petNameValues).pipe(
    Flag.withDescription("Bypass the prompt with an explicit selection"),
    Flag.optional,
  ),
  "max-items": Flag.integer("max-items").pipe(
    Flag.withDescription("Maximum number of items to display per page"),
    Flag.optional,
  ),
  placeholder: Flag.string("placeholder").pipe(
    Flag.withDescription("Placeholder text shown in the filter input"),
    Flag.optional,
  ),
} as const;

const handleAutocomplete = (args: {
  readonly value: Option.Option<(typeof petNameValues)[number]>;
  readonly maxItems: Option.Option<number>;
  readonly placeholder: Option.Option<string>;
}) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const message = "Search for a pet:";
    const choice = yield* Option.match(args.value, {
      onSome: Effect.succeed,
      onNone: () =>
        requireInteractive(
          Prompt.autoComplete({
            message,
            choices: petNameChoices,
            ...(Option.isSome(args.maxItems) && { maxPerPage: args.maxItems.value }),
            ...(Option.isSome(args.placeholder) && { filterPlaceholder: args.placeholder.value }),
          }),
          { message },
        ),
    });

    yield* renderer.success(`Selected: ${choice}`);
  });

export const autocompleteCommand = Command.make(
  "autocomplete",
  autocompleteConfig,
  ({ value, ["max-items"]: maxItems, placeholder }) =>
    handleAutocomplete({ value, maxItems, placeholder }).pipe(withRuntime("prompts autocomplete")),
).pipe(
  withArgvTracking(autocompleteConfig),
  Command.withDescription("Demo autocomplete prompt"),
  Command.withExamples([
    {
      command: "axm-spike prompts autocomplete",
      description: "Open the interactive pet name search prompt",
    },
    {
      command: "axm-spike prompts autocomplete --value Mochi",
      description: "Select a pet non-interactively",
    },
  ]),
);
