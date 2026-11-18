/**
 * The lab: a never-published CLI for terminal design work, run from source.
 *
 * Usage:
 *   bun --conditions=axm-source scripts/lab.ts list
 *   bun --conditions=axm-source scripts/lab.ts gallery [--name <fixture>] [--width <columns>] [--rows <rows>] [--ascii] [--plain]
 *   bun --conditions=axm-source scripts/lab.ts ask <name> [--steps <script>] [--size <columns>x<rows>] [--frames] [--ascii] [--plain]
 *
 * `list` names the gallery fixtures. `gallery` paints them, every fixture at
 * the current terminal size by default; `--rows` sets the height a live scene
 * is fitted to, and settled documents ignore it. `ask` drives one sample
 * question through its own reducer in process with the key-step grammar the
 * pseudo-terminal preview takes, and prints the question after the last step,
 * or after every step with `--frames`, then how it ended.
 */

import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Formatter from "effect/Formatter";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Terminal from "effect/Terminal";
import { Argument, CliError, Command, Flag } from "effect/cli";

import { describeKeyStep, parseKeySteps, parseTerminalSize } from "@agentxm/test-support/key-steps";

import { asciiGlyphs, unicodeGlyphs } from "../src/screen/glyphs.js";
import { resolveCliOutputPolicy } from "../src/screen/output-policy.js";
import type { TerminalSize } from "../src/screen/scene.js";
import { discoverGallery } from "../src/test-support/gallery/discover.js";
import { driveAsk } from "../src/test-support/gallery/drive-ask.js";
import { paintFixture } from "../src/test-support/gallery/fixture.js";
import { sampleAsks } from "../src/test-support/gallery/samples/sample-asks.js";

/** The terminal this runs in, or 80 by 24 where the output is not a terminal. */
const currentTerminal = Effect.gen(function* () {
  const terminal = yield* Terminal.Terminal;
  const columns = yield* terminal.columns;
  const rows = yield* terminal.rows;
  return { columns: columns > 0 ? columns : 80, rows: rows > 0 ? rows : 24 };
});

const styleFlags = {
  ascii: Flag.Boolean("ascii").pipe(
    Flag.withDescription("Paint with seven-bit ASCII glyphs"),
    Flag.withDefault(false),
  ),
  plain: Flag.Boolean("plain").pipe(
    Flag.withDescription("Paint without colour"),
    Flag.withDefault(false),
  ),
};

/** The paint style the terminal's own policy chooses, less what the flags turn off. */
const paintStyle = (flags: { readonly ascii: boolean; readonly plain: boolean }) => {
  const policy = resolveCliOutputPolicy();
  return {
    colors: policy.stdoutColors && !flags.plain,
    glyphs: flags.ascii || policy.glyphs === "ascii" ? asciiGlyphs : unicodeGlyphs,
  };
};

const userError = (message: string) =>
  new CliError.UserError({ cause: new Error(message), userMessage: message });

const positive = (name: string) =>
  Flag.Int(name).pipe(
    Flag.filterMap(
      (value) => (value > 0 ? Option.some(value) : Option.none()),
      (value) => `--${name} takes a positive whole number, not ${String(value)}.`,
    ),
    Flag.optional,
  );

const sizeFlag = Flag.String("size").pipe(
  Flag.withDescription("The terminal as columns by rows, such as 80x24"),
  Flag.filterMap(
    parseTerminalSize,
    (value) => `--size names a terminal as columns by rows, such as 80x24, not ${value}.`,
  ),
  Flag.optional,
);

const listCommand = Command.make("list", {}, () =>
  Effect.gen(function* () {
    const gallery = yield* discoverGallery;
    for (const fixture of gallery) yield* Console.log(fixture.name);
  }),
).pipe(Command.withDescription("Name every gallery fixture"));

const galleryCommand = Command.make(
  "gallery",
  {
    name: Flag.String("name").pipe(
      Flag.withDescription("Paint only the fixture of this name"),
      Flag.optional,
    ),
    width: positive("width").pipe(Flag.withDescription("Columns to paint at")),
    rows: positive("rows").pipe(Flag.withDescription("Rows a live scene is fitted to")),
    ...styleFlags,
  },
  (flags) =>
    Effect.gen(function* () {
      const gallery = yield* discoverGallery;
      const terminal = yield* currentTerminal;
      const width = Option.getOrElse(flags.width, () => terminal.columns);
      const rows = Option.getOrElse(flags.rows, () => terminal.rows);
      const selected = Option.match(flags.name, {
        onNone: () => gallery,
        onSome: (name) => gallery.filter((fixture) => fixture.name === name),
      });
      if (selected.length === 0)
        return yield* userError(
          `No fixture is named ${Option.getOrElse(flags.name, () => "")}. Fixtures: ${gallery.map((fixture) => fixture.name).join(", ")}`,
        );
      const style = paintStyle(flags);
      for (const fixture of selected) {
        const size =
          fixture._tag === "document" ? String(width) : `${String(width)}x${String(rows)}`;
        yield* Console.log(
          `── ${fixture.name} @ ${size} ${"─".repeat(Math.max(0, width - fixture.name.length - 8 - size.length))}`,
        );
        yield* Console.log(paintFixture(fixture, { columns: width, rows }, style).join("\n"));
        yield* Console.log("");
      }
    }),
).pipe(Command.withDescription("Paint gallery fixtures at a chosen size"));

const askCommand = Command.make(
  "ask",
  {
    name: Argument.Literals(
      "name",
      sampleAsks.map((sample) => sample.name),
    ).pipe(Argument.withDescription("The sample question to drive")),
    steps: Flag.String("steps").pipe(
      Flag.withDescription(
        "Key steps separated by commas: keys by name such as down*3 or space, type:<text>, size:<columns>x<rows>",
      ),
      Flag.withDefault(""),
    ),
    size: sizeFlag,
    frames: Flag.Boolean("frames").pipe(
      Flag.withDescription("Print the question after every step, not only the last"),
      Flag.withDefault(false),
    ),
    ...styleFlags,
  },
  (flags) =>
    Effect.gen(function* () {
      const sample = sampleAsks.find((candidate) => candidate.name === flags.name);
      if (sample === undefined)
        return yield* userError(`No sample question is named ${flags.name}.`);
      const steps = parseKeySteps(flags.steps);
      if (Result.isFailure(steps)) return yield* userError(steps.failure);
      const terminal: TerminalSize = Option.isSome(flags.size)
        ? flags.size.value
        : yield* currentTerminal;
      const run = driveAsk(sample.ask, steps.success, terminal, paintStyle(flags));
      if (Result.isFailure(run)) return yield* userError(run.failure);
      const { frames, ending } = run.success;
      const shown = flags.frames ? frames : frames.slice(-1);
      for (const [index, frame] of shown.entries()) {
        if (flags.frames)
          yield* Console.log(
            frame.after === undefined ? "── opened" : `── after ${describeKeyStep(frame.after)}`,
          );
        yield* Console.log(frame.lines.join("\n"));
        if (flags.frames && index < shown.length - 1) yield* Console.log("");
      }
      if (ending._tag === "Submitted") {
        yield* Console.log(`\n── submitted ${Formatter.format(ending.value)}`);
        yield* Console.log(ending.answer.join("\n"));
      } else if (ending._tag === "Cancelled") {
        yield* Console.log("\n── cancelled");
      }
    }),
).pipe(Command.withDescription("Drive a sample question through key steps in process"));

const lab = Command.make("lab").pipe(
  Command.withDescription("Terminal design tools for the axm CLI, run from source"),
  Command.withSubcommands([listCommand, galleryCommand, askCommand]),
);

NodeRuntime.runMain(
  Command.run(lab, { version: "0.0.0" }).pipe(Effect.provide(NodeServices.layer)),
);
