import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag, Prompt } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { fromFlagOrInteractivePrompt } from "./helpers.js";
import { withRuntime } from "../../runtime.js";

const toBoolean = (value: "yes" | "no"): boolean => value === "yes";

const toggleConfig = {
  value: Flag.choice("value", ["yes", "no"] as const).pipe(
    Flag.withDescription("Bypass the prompt with an explicit toggle value"),
    Flag.optional,
  ),
} as const;

const handleToggle = (args: { readonly value: Option.Option<"yes" | "no"> }) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const message = "Adoptable?";
    const adoptable = yield* fromFlagOrInteractivePrompt(
      Option.map(args.value, toBoolean),
      Prompt.toggle({
        message,
        active: "yes",
        inactive: "no",
      }),
      { message },
    );

    yield* renderer.success(`Adoptable: ${adoptable ? "yes" : "no"}`);
  });

export const toggleCommand = Command.make("toggle", toggleConfig, ({ value }) =>
  handleToggle({ value }).pipe(withRuntime("prompts toggle")),
).pipe(
  withArgvTracking(toggleConfig),
  Command.withDescription("Demo toggle prompt"),
  Command.withExamples([
    {
      command: "axm-spike prompts toggle",
      description: "Open the interactive toggle prompt",
    },
    {
      command: "axm-spike prompts toggle --value yes",
      description: "Resolve the toggle prompt non-interactively",
    },
  ]),
);
