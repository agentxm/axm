import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

const introConfig = {
  title: Argument.string("title").pipe(
    Argument.withDescription("Title to render in the intro frame"),
    Argument.optional,
  ),
} as const;

const handleIntro = (args: { readonly title: Option.Option<string> }) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    yield* renderer.intro(Option.getOrElse(args.title, () => "Welcome to axm-spike"));
  });

export const introCommand = Command.make("intro", introConfig, ({ title }) =>
  handleIntro({ title }).pipe(withRuntime({ command: "outputs intro" })),
).pipe(
  withArgvTracking(introConfig),
  Command.withDescription("Render intro framing"),
  Command.withExamples([
    {
      command: 'axm-spike outputs intro "Workspace ready"',
      description: "Render a custom intro title",
    },
  ]),
);
