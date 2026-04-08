import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { CliPrompt, fromFlagOrPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

const passwordConfig = {
  value: Flag.string("value").pipe(
    Flag.withDescription("Bypass the prompt with an explicit password value"),
    Flag.optional,
  ),
  mask: Flag.string("mask").pipe(
    Flag.withDescription("Character used to mask input"),
    Flag.optional,
  ),
} as const;

const handlePassword = (args: {
  readonly value: Option.Option<string>;
  readonly mask: Option.Option<string>;
}) =>
  Effect.gen(function* () {
    const prompt = yield* CliPrompt;
    const renderer = yield* CliRenderer;
    const token = yield* fromFlagOrPrompt(args.value, () =>
      prompt.password({
        message: "Enter your secret:",
        ...(Option.isSome(args.mask) && { mask: args.mask.value }),
      }),
    );

    yield* renderer.success(`Secret received (${String(token.length)} chars)`);
  });

export const passwordCommand = Command.make("password", passwordConfig, ({ value, mask }) =>
  handlePassword({ value, mask }).pipe(withRuntime({ command: "prompts password" })),
).pipe(
  withArgvTracking(passwordConfig),
  Command.withDescription("Demo password input prompt"),
  Command.withExamples([
    {
      command: "axm-spike prompts password",
      description: "Open the interactive password prompt",
    },
    {
      command: "axm-spike prompts password --value hunter2",
      description: "Resolve the password prompt non-interactively",
    },
  ]),
);
