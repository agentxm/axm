import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import { Command, Flag, Prompt } from "effect/unstable/cli";

import { requireInteractive } from "@agentxm/client-core/unstable/cli/prompt";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

const passwordConfig = {
  value: Flag.string("value").pipe(
    Flag.withDescription("Bypass the prompt with an explicit password value"),
    Flag.optional,
  ),
} as const;

const handlePassword = (args: { readonly value: Option.Option<string> }) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const message = "Enter admin authorization code:";
    const code = yield* Option.match(Option.map(args.value, Redacted.make), {
      onSome: Effect.succeed,
      onNone: () => requireInteractive(Prompt.password({ message }), { message }),
    });

    yield* renderer.success(`Secret received (${String(Redacted.value(code).length)} chars)`);
  });

export const passwordCommand = Command.make("password", passwordConfig, ({ value }) =>
  handlePassword({ value }).pipe(withRuntime("prompts password")),
).pipe(
  withArgvTracking(passwordConfig),
  Command.withDescription("Demo password input prompt"),
  Command.withExamples([
    {
      command: "axm-spike prompts password",
      description: "Open the interactive password prompt for admin authorization",
    },
    {
      command: "axm-spike prompts password --value secret123",
      description: "Resolve the password prompt non-interactively",
    },
  ]),
);
