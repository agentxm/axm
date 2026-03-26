import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { CliPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withRuntime } from "../../runtime.js";

const confirmConfig = {
  active: Flag.string("active").pipe(
    Flag.withDescription("Label for the active (true) option"),
    Flag.optional,
  ),
  inactive: Flag.string("inactive").pipe(
    Flag.withDescription("Label for the inactive (false) option"),
    Flag.optional,
  ),
  initial: Flag.boolean("initial").pipe(Flag.withDescription("Initial value for the confirmation")),
  vertical: Flag.boolean("vertical").pipe(Flag.withDescription("Display options vertically")),
} as const;

export const confirmCommand = Command.make("confirm", confirmConfig, (config) =>
  withRuntime(
    Effect.gen(function* () {
      const prompt = yield* CliPrompt;
      const renderer = yield* CliRenderer;
      const result = yield* prompt.confirm({
        message: "Do you want to continue?",
        ...(Option.isSome(config.active) && { active: config.active.value }),
        ...(Option.isSome(config.inactive) && { inactive: config.inactive.value }),
        initialValue: true,
        ...(config.vertical && { vertical: true }),
      });
      yield* renderer.success(`You chose: ${result ? "Yes" : "No"}`);
    }),
    { command: "prompts confirm" },
  ),
).pipe(Command.withDescription("Demo confirm prompt"));
