import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { CliPrompt, fromFlagOrPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

const pathConfig = {
  value: Flag.string("value").pipe(
    Flag.withDescription("Bypass the prompt with an explicit path"),
    Flag.optional,
  ),
  root: Flag.string("root").pipe(
    Flag.withDescription("Root directory for path completion"),
    Flag.optional,
  ),
  directory: Flag.boolean("directory").pipe(Flag.withDescription("Only show directories")),
  initial: Flag.string("initial").pipe(Flag.withDescription("Initial path value"), Flag.optional),
} as const;

const handlePath = (args: {
  readonly value: Option.Option<string>;
  readonly root: Option.Option<string>;
  readonly directory: boolean;
  readonly initial: Option.Option<string>;
}) =>
  Effect.gen(function* () {
    const prompt = yield* CliPrompt;
    const renderer = yield* CliRenderer;
    const selected = yield* fromFlagOrPrompt(args.value, () =>
      prompt.path({
        message: "Select a path:",
        ...(Option.isSome(args.root) && { root: args.root.value }),
        ...(args.directory && { directory: true }),
        ...(Option.isSome(args.initial) && { initialValue: args.initial.value }),
      }),
    );

    yield* renderer.success(`Selected path: ${selected}`);
  });

export const pathCommand = Command.make("path", pathConfig, ({ value, root, directory, initial }) =>
  handlePath({ value, root, directory, initial }).pipe(withRuntime({ command: "prompts path" })),
).pipe(
  withArgvTracking(pathConfig),
  Command.withDescription("Demo path input prompt"),
  Command.withExamples([
    {
      command: "axm-spike prompts path",
      description: "Open the interactive path prompt",
    },
    {
      command: "axm-spike prompts path --value ./packages/cli-spike",
      description: "Resolve the path prompt non-interactively",
    },
  ]),
);
