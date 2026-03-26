import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { type BoxOptions, CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withRuntime } from "../../runtime.js";

const boxConfig = {
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

export const boxCommand = Command.make("box", boxConfig, (config) =>
  withRuntime(
    Effect.gen(function* () {
      const renderer = yield* CliRenderer;
      const opts: BoxOptions = {
        ...(Option.isSome(config.contentAlign) && {
          contentAlignment: config.contentAlign.value,
        }),
        ...(Option.isSome(config.titleAlign) && { titleAlignment: config.titleAlign.value }),
        ...(Option.isSome(config.width) && { width: config.width.value }),
        ...(Option.isSome(config.padding) && { padding: config.padding.value }),
        rounded: config.rounded,
      };
      yield* renderer.box(
        "This is content inside a box.\nIt can span multiple lines.",
        Option.getOrUndefined(config.title),
        opts,
      );
    }),
    { command: "outputs box" },
  ),
).pipe(Command.withDescription("Render content in a bordered box"));
