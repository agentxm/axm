import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { CliPrompt, fromFlagOrPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

const actionValues = ["d", "r", "c"] as const;

const actionOptions = [
  { value: "d" as const, label: "[d]elete" },
  { value: "r" as const, label: "[r]ename" },
  { value: "c" as const, label: "[c]opy" },
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
    const prompt = yield* CliPrompt;
    const renderer = yield* CliRenderer;
    const choice = yield* fromFlagOrPrompt(args.value, () =>
      prompt.selectKey({
        message: "Choose an action:",
        options: [...actionOptions],
        ...(args.caseSensitive && { caseSensitive: true }),
      }),
    );

    yield* renderer.success(`You chose: ${choice}`);
  });

export const selectKeyCommand = Command.make(
  "select-key",
  selectKeyConfig,
  ({ value, ["case-sensitive"]: caseSensitive }) =>
    handleSelectKey({ value, caseSensitive }).pipe(withRuntime({ command: "prompts select-key" })),
).pipe(
  withArgvTracking(selectKeyConfig),
  Command.withDescription("Demo select-key prompt"),
  Command.withExamples([
    {
      command: "axm-spike prompts select-key",
      description: "Open the interactive key-select prompt",
    },
    {
      command: "axm-spike prompts select-key --value r",
      description: "Resolve the key-select prompt non-interactively",
    },
  ]),
);
