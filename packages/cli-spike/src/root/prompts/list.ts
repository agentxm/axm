import * as Effect from "effect/Effect";
import { Command, Flag, Prompt } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { fromValuesOrInteractivePrompt } from "./helpers.js";
import { withRuntime } from "../../runtime.js";

const listConfig = {
  value: Flag.string("value").pipe(
    Flag.withDescription("Bypass the prompt with explicit tag values (repeatable)"),
    Flag.atLeast(0),
  ),
} as const;

const handleList = (args: { readonly value: ReadonlyArray<string> }) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const message = "Pet tags (comma-separated):";
    const tags = yield* fromValuesOrInteractivePrompt(args.value, Prompt.list({ message }), {
      message,
    });

    yield* renderer.success(`Tags: ${tags.join(", ")}`);
  });

export const listCommand = Command.make("list", listConfig, ({ value }) =>
  handleList({ value }).pipe(withRuntime("prompts list")),
).pipe(
  withArgvTracking(listConfig),
  Command.withDescription("Demo list input prompt"),
  Command.withExamples([
    {
      command: "axm-spike prompts list",
      description: "Open the interactive list prompt for pet tags",
    },
    {
      command: "axm-spike prompts list --value friendly --value house-trained",
      description: "Resolve the prompt non-interactively with explicit tags",
    },
  ]),
);
