import * as Effect from "effect/Effect";
import { Command, Flag } from "effect/unstable/cli";

import { CliPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withRuntime } from "../../runtime.js";

const actionOptions = [
  { value: "d" as const, label: "[d]elete" },
  { value: "r" as const, label: "[r]ename" },
  { value: "c" as const, label: "[c]opy" },
] as const;

const selectKeyConfig = {
  "case-sensitive": Flag.boolean("case-sensitive").pipe(
    Flag.withDescription("Enable case-sensitive key matching"),
  ),
} as const;

export const selectKeyCommand = Command.make("select-key", selectKeyConfig, (config) =>
  withRuntime(
    Effect.gen(function* () {
      const prompt = yield* CliPrompt;
      const renderer = yield* CliRenderer;
      const choice = yield* prompt.selectKey({
        message: "Choose an action:",
        options: [...actionOptions],
        ...(config["case-sensitive"] && { caseSensitive: true }),
      });
      yield* renderer.success(`You chose: ${choice}`);
    }),
    { command: "prompts select-key" },
  ),
).pipe(Command.withDescription("Demo select-key prompt"));
