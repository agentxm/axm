import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { CliPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withRuntime } from "../../runtime.js";

const passwordConfig = {
  mask: Flag.string("mask").pipe(
    Flag.withDescription("Character used to mask input"),
    Flag.optional,
  ),
} as const;

export const passwordCommand = Command.make("password", passwordConfig, (config) =>
  withRuntime(
    Effect.gen(function* () {
      const prompt = yield* CliPrompt;
      const renderer = yield* CliRenderer;
      const token = yield* prompt.password({
        message: "Enter your secret:",
        ...(Option.isSome(config.mask) && { mask: config.mask.value }),
      });
      yield* renderer.success(`Secret received (${String(token.length)} chars)`);
    }),
    { command: "prompts password" },
  ),
).pipe(Command.withDescription("Demo password input prompt"));
