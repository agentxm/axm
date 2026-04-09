import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

const noteConfig = {
  message: Argument.string("message").pipe(
    Argument.withDescription("Note body"),
    Argument.optional,
  ),
  title: Flag.string("title").pipe(Flag.withDescription("Optional note title"), Flag.optional),
} as const;

const handleNote = (args: {
  readonly message: Option.Option<string>;
  readonly title: Option.Option<string>;
}) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    yield* renderer.note(
      Option.getOrElse(args.message, () => "This note is rendered through CliRenderer.note()."),
      Option.getOrUndefined(args.title),
    );
  });

export const noteCommand = Command.make("note", noteConfig, ({ message, title }) =>
  handleNote({ message, title }).pipe(withRuntime("outputs note")),
).pipe(
  withArgvTracking(noteConfig),
  Command.withDescription("Render note output"),
  Command.withExamples([
    {
      command: 'axm-spike outputs note "Read the deploy checklist" --title Reminder',
      description: "Render a titled note",
    },
  ]),
);
