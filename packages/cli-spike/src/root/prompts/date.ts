import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag, Prompt } from "effect/unstable/cli";

import { requireInteractive } from "@agentxm/client-core/unstable/cli/prompt";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

const dateConfig = {
  value: Flag.date("value").pipe(
    Flag.withDescription("Bypass the prompt with an explicit intake date"),
    Flag.optional,
  ),
} as const;

const handleDate = (args: { readonly value: Option.Option<Date> }) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const message = "Intake date:";
    const intake = yield* Option.match(args.value, {
      onSome: Effect.succeed,
      onNone: () => requireInteractive(Prompt.date({ message }), { message }),
    });

    yield* renderer.success(`Intake date: ${intake.toISOString().slice(0, 10)}`);
  });

export const dateCommand = Command.make("date", dateConfig, ({ value }) =>
  handleDate({ value }).pipe(withRuntime("prompts date")),
).pipe(
  withArgvTracking(dateConfig),
  Command.withDescription("Demo date input prompt"),
  Command.withExamples([
    {
      command: "axm-spike prompts date",
      description: "Open the interactive date prompt for pet intake",
    },
    {
      command: "axm-spike prompts date --value 2026-04-08",
      description: "Resolve the prompt non-interactively with an intake date",
    },
  ]),
);
