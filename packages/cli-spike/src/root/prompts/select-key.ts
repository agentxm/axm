import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { AxmPrompt, requireInteractive } from "@axm.sh/core/unstable/cli/prompt";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

const actionValues = ["adopt", "intake", "list", "register"] as const;

const actionChoices = [
  { key: "a", title: "Adopt a pet", value: "adopt" as const },
  { key: "i", title: "Intake a pet", value: "intake" as const },
  { key: "l", title: "List all pets", value: "list" as const },
  { key: "r", title: "Register owner", value: "register" as const },
] as const;

const selectKeyConfig = {
  value: Flag.choice("value", actionValues).pipe(
    Flag.withDescription("Bypass the prompt with an explicit key selection"),
    Flag.optional,
  ),
  "case-sensitive": Flag.boolean("case-sensitive").pipe(
    Flag.withDescription("Enable case-sensitive key matching"),
  ),
} as const;

const handleSelectKey = (args: {
  readonly value: Option.Option<(typeof actionValues)[number]>;
  readonly caseSensitive: boolean;
}) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const message = "Quick action:";
    const choice = yield* Option.match(args.value, {
      onSome: Effect.succeed,
      onNone: () =>
        requireInteractive(
          AxmPrompt.selectKey({
            message,
            choices: [...actionChoices],
            ...(args.caseSensitive && { caseSensitive: true }),
          }),
          { message },
        ),
    });

    yield* renderer.success(`You chose: ${choice}`);
  });

export const selectKeyCommand = Command.make(
  "select-key",
  selectKeyConfig,
  ({ value, ["case-sensitive"]: caseSensitive }) =>
    handleSelectKey({ value, caseSensitive }).pipe(withRuntime("prompts select-key")),
).pipe(
  withArgvTracking(selectKeyConfig),
  Command.withDescription("Demo select-key prompt"),
  Command.withExamples([
    {
      command: "axm-spike prompts select-key",
      description: "Open the interactive key-select prompt",
    },
    {
      command: "axm-spike prompts select-key --value adopt",
      description: "Resolve the key-select prompt non-interactively",
    },
  ]),
);
