import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { type BoxOptions, CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

const boxConfig = {
  content: Argument.string("content").pipe(
    Argument.withDescription("Content to render inside the box"),
    Argument.optional,
  ),
  title: Flag.string("title").pipe(Flag.withDescription("Box title"), Flag.optional),
  contentAlign: Flag.choice("content-align", ["left", "center", "right"] as const).pipe(
    Flag.withDescription("Content alignment"),
    Flag.optional,
  ),
  titleAlign: Flag.choice("title-align", ["left", "center", "right"] as const).pipe(
    Flag.withDescription("Title alignment"),
    Flag.optional,
  ),
  width: Flag.integer("width").pipe(Flag.withDescription("Box width in columns"), Flag.optional),
  padding: Flag.integer("padding").pipe(
    Flag.withDescription("Padding inside the box"),
    Flag.optional,
  ),
  rounded: Flag.boolean("rounded").pipe(Flag.withDescription("Use rounded corners")),
} as const;

const handleBox = (args: {
  readonly content: Option.Option<string>;
  readonly title: Option.Option<string>;
  readonly contentAlign: Option.Option<"left" | "center" | "right">;
  readonly titleAlign: Option.Option<"left" | "center" | "right">;
  readonly width: Option.Option<number>;
  readonly padding: Option.Option<number>;
  readonly rounded: boolean;
}) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const options: BoxOptions = {
      ...(Option.isSome(args.contentAlign) && {
        contentAlignment: args.contentAlign.value,
      }),
      ...(Option.isSome(args.titleAlign) && {
        titleAlignment: args.titleAlign.value,
      }),
      ...(Option.isSome(args.width) && { width: args.width.value }),
      ...(Option.isSome(args.padding) && { padding: args.padding.value }),
      rounded: args.rounded,
    };

    yield* renderer.box(
      Option.getOrElse(args.content, () => "This box renders one message at a time."),
      Option.getOrUndefined(args.title),
      options,
    );
  });

export const boxCommand = Command.make(
  "box",
  boxConfig,
  ({ content, title, contentAlign, titleAlign, width, padding, rounded }) =>
    handleBox({ content, title, contentAlign, titleAlign, width, padding, rounded }).pipe(
      withRuntime("outputs box"),
    ),
).pipe(
  withArgvTracking(boxConfig),
  Command.withDescription("Render content in a bordered box"),
  Command.withExamples([
    {
      command: 'axm-spike outputs box "Release ready" --title Status --rounded',
      description: "Render a rounded status box",
    },
  ]),
);
