import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag, Prompt } from "effect/unstable/cli";

import { requireInteractive } from "@axm.sh/core/unstable/cli/prompt";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

const pathConfig = {
  value: Flag.string("value").pipe(
    Flag.withDescription("Bypass the prompt with an explicit path"),
    Flag.optional,
  ),
  root: Flag.string("root").pipe(
    Flag.withDescription("Starting directory for path completion"),
    Flag.optional,
  ),
  directory: Flag.boolean("directory").pipe(Flag.withDescription("Only show directories")),
} as const;

const handlePath = (args: {
  readonly value: Option.Option<string>;
  readonly root: Option.Option<string>;
  readonly directory: boolean;
}) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const message = "Select pet records directory:";
    const selected = yield* Option.match(args.value, {
      onSome: Effect.succeed,
      onNone: () =>
        requireInteractive(
          Prompt.file({
            message,
            ...(args.directory && { type: "directory" as const }),
            ...(Option.isSome(args.root) && { startingPath: args.root.value }),
          }),
          { message },
        ),
    });

    yield* renderer.success(`Selected path: ${selected}`);
  });

export const pathCommand = Command.make("path", pathConfig, ({ value, root, directory }) =>
  handlePath({ value, root, directory }).pipe(withRuntime("prompts path")),
).pipe(
  withArgvTracking(pathConfig),
  Command.withDescription("Demo path input prompt"),
  Command.withExamples([
    {
      command: "axm-spike prompts path",
      description: "Open the interactive pet records directory prompt",
    },
    {
      command: "axm-spike prompts path --value ./records",
      description: "Resolve the path prompt non-interactively",
    },
  ]),
);
