import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import { Command, Flag, Prompt } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { fromFlagOrInteractivePrompt } from "./helpers.js";
import { withRuntime } from "../../runtime.js";

const hiddenConfig = {
  value: Flag.string("value").pipe(
    Flag.withDescription("Bypass the prompt with an explicit value"),
    Flag.optional,
  ),
} as const;

const handleHidden = (args: { readonly value: Option.Option<string> }) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const message = "Admin override code:";
    const code = yield* fromFlagOrInteractivePrompt(
      Option.map(args.value, Redacted.make),
      Prompt.hidden({ message }),
      { message },
    );

    yield* renderer.success(`Code received (${String(Redacted.value(code).length)} chars)`);
  });

export const hiddenCommand = Command.make("hidden", hiddenConfig, ({ value }) =>
  handleHidden({ value }).pipe(withRuntime("prompts hidden")),
).pipe(
  withArgvTracking(hiddenConfig),
  Command.withDescription("Demo hidden input prompt"),
  Command.withExamples([
    {
      command: "axm-spike prompts hidden",
      description: "Open the interactive hidden prompt for admin code",
    },
    {
      command: "axm-spike prompts hidden --value secret123",
      description: "Resolve the prompt non-interactively with a value",
    },
  ]),
);
