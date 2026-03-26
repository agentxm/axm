import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { CliPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withRuntime } from "../../runtime.js";

const pathConfig = {
  root: Flag.string("root").pipe(
    Flag.withDescription("Root directory for path completion"),
    Flag.optional,
  ),
  directory: Flag.boolean("directory").pipe(Flag.withDescription("Only show directories")),
  initial: Flag.string("initial").pipe(Flag.withDescription("Initial path value"), Flag.optional),
} as const;

export const pathCommand = Command.make("path", pathConfig, (config) =>
  withRuntime(
    Effect.gen(function* () {
      const prompt = yield* CliPrompt;
      const renderer = yield* CliRenderer;
      const selected = yield* prompt.path({
        message: "Select a path:",
        ...(Option.isSome(config.root) && { root: config.root.value }),
        ...(config.directory && { directory: true }),
        ...(Option.isSome(config.initial) && { initialValue: config.initial.value }),
      });
      yield* renderer.success(`Selected path: ${selected}`);
    }),
    { command: "prompts path" },
  ),
).pipe(Command.withDescription("Demo path input prompt"));
