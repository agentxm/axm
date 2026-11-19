/**
 * The lab: a never-published CLI for terminal design work, run from source
 * with `pnpm lab`.
 *
 *   pnpm lab                          browse the gallery and view a fixture
 *   pnpm lab view <fixture>           view one fixture, repainted on resize
 *   pnpm lab gallery [--name <fixture>] [--size 80x24]
 *   pnpm lab ask <question> [--steps <script>] [--frames]
 *   pnpm lab play [<recording>] [--speed 0.5]
 *   pnpm lab run [--steps <script>] [--frames] -- <axm arguments>
 *   pnpm lab new <view.ts>            start a fixture beside a view
 *   pnpm lab accept <fixture...>      record those fixtures' snapshots
 *   pnpm lab review [--base <rev>]    changed snapshots, before and after
 *
 * Every command paints at the current terminal's size unless `--size` names
 * one. `--watch` anywhere on the line reruns the command whenever a source
 * file it loaded changes.
 */

import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Config from "effect/Config";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Formatter from "effect/Formatter";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { Argument, Command, Flag } from "effect/cli";
import { ChildProcess } from "effect/process";

import { describeKeyStep, parseKeySteps } from "@agentxm/test-support/key-steps";

import { InteractiveScreen } from "../../src/screen/interactive.js";
import { OutputStreamsLive } from "../../src/screen/streams.js";
import { discoverGallery } from "../../src/test-support/gallery/discover.js";
import { driveAsk } from "../../src/test-support/gallery/drive-ask.js";
import { paintFixture } from "../../src/test-support/gallery/fixture.js";
import { sampleAsks } from "../../src/test-support/gallery/samples/sample-asks.js";

import { acceptFixtures } from "./accept.js";
import { browseFixtures } from "./browse.js";
import { newFixture } from "./new.js";
import { playRecording, recordings } from "./play.js";
import { reviewSnapshots } from "./review.js";
import { runUnderTerminal } from "./run.js";
import { paintStyle, resolveSize, sizeFlag, styleFlags, userError } from "./shared.js";
import { viewFixtures } from "./view.js";

const stepsFlag = Flag.String("steps").pipe(
  Flag.withDescription(
    "Key steps separated by commas: keys by name such as down*3 or space, type:<text>, await:<text>, size:<columns>x<rows>",
  ),
  Flag.withDefault(""),
);

const framesFlag = Flag.Boolean("frames").pipe(
  Flag.withDescription("Print the screen after every step, not only the last"),
  Flag.withDefault(false),
);

const fixtureNamed = (name: string) =>
  Effect.gen(function* () {
    const gallery = yield* discoverGallery;
    const index = gallery.findIndex((fixture) => fixture.name === name);
    if (index < 0)
      return yield* userError(`No fixture is named ${name}. List them with \`pnpm lab list\`.`);
    return { gallery, index };
  });

const listCommand = Command.make("list", {}, () =>
  Effect.gen(function* () {
    const gallery = yield* discoverGallery;
    for (const fixture of gallery) yield* Console.log(fixture.name);
  }),
).pipe(Command.withDescription("Name every gallery fixture"));

const viewCommand = Command.make(
  "view",
  {
    name: Argument.String("fixture").pipe(Argument.withDescription("The fixture to view")),
    ...styleFlags,
  },
  (flags) =>
    Effect.gen(function* () {
      const { gallery, index } = yield* fixtureNamed(flags.name);
      yield* viewFixtures(gallery, index, paintStyle(flags));
    }).pipe(Effect.provide(OutputStreamsLive)),
).pipe(
  Command.withDescription(
    "View one fixture at the terminal's size, repainted on resize; arrows change width and scroll, n and p move between fixtures, a and c toggle ASCII and colour",
  ),
);

const galleryCommand = Command.make(
  "gallery",
  {
    name: Flag.String("name").pipe(
      Flag.withDescription("Paint only the fixture of this name"),
      Flag.optional,
    ),
    size: sizeFlag,
    ...styleFlags,
  },
  (flags) =>
    Effect.gen(function* () {
      const gallery = yield* discoverGallery;
      const terminal = yield* resolveSize(flags.size);
      const selected = Option.match(flags.name, {
        onNone: () => gallery,
        onSome: (name) => gallery.filter((fixture) => fixture.name === name),
      });
      if (selected.length === 0)
        return yield* userError(
          `No fixture is named ${Option.getOrElse(flags.name, () => "")}. List them with \`pnpm lab list\`.`,
        );
      const style = paintStyle(flags);
      for (const fixture of selected) {
        const size =
          fixture._tag === "document"
            ? String(terminal.columns)
            : `${String(terminal.columns)}x${String(terminal.rows)}`;
        yield* Console.log(
          `── ${fixture.name} @ ${size} ${"─".repeat(Math.max(0, terminal.columns - fixture.name.length - 8 - size.length))}`,
        );
        yield* Console.log(paintFixture(fixture, terminal, style).join("\n"));
        yield* Console.log("");
      }
    }),
).pipe(Command.withDescription("Print gallery fixtures at a size, for piping or comparing"));

const askCommand = Command.make(
  "ask",
  {
    name: Argument.Literals(
      "question",
      sampleAsks.map((sample) => sample.name),
    ).pipe(Argument.withDescription("The sample question to drive")),
    steps: stepsFlag,
    size: sizeFlag,
    frames: framesFlag,
    ...styleFlags,
  },
  (flags) =>
    Effect.gen(function* () {
      const sample = sampleAsks.find((candidate) => candidate.name === flags.name);
      if (sample === undefined)
        return yield* userError(`No sample question is named ${flags.name}.`);
      const steps = parseKeySteps(flags.steps);
      if (Result.isFailure(steps)) return yield* userError(steps.failure);
      const terminal = yield* resolveSize(flags.size);
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

const playCommand = Command.make(
  "play",
  {
    name: Argument.String("recording").pipe(
      Argument.withDescription("The recording to replay; omit it to list them"),
      Argument.optional,
    ),
    speed: Flag.Finite("speed").pipe(
      Flag.withDescription("How much faster than recorded to replay, such as 0.25 or 4"),
      Flag.filterMap(
        (speed) => (speed > 0 ? Option.some(speed) : Option.none()),
        (speed) => `--speed takes a positive number, not ${String(speed)}.`,
      ),
      Flag.withDefault(1),
    ),
  },
  (flags) =>
    Effect.gen(function* () {
      const available = yield* recordings;
      if (Option.isNone(flags.name)) {
        for (const name of available.keys()) yield* Console.log(name);
        return;
      }
      const events = available.get(flags.name.value);
      if (events === undefined)
        return yield* userError(
          `No recording is named ${flags.name.value}. Recordings: ${[...available.keys()].join(", ")}`,
        );
      yield* playRecording(flags.name.value, events, flags.speed).pipe(
        Effect.provide(InteractiveScreen()),
      );
    }),
).pipe(Command.withDescription("Replay a recorded operation through the real screen"));

const runCommand = Command.make(
  "run",
  {
    size: sizeFlag,
    steps: stepsFlag,
    frames: framesFlag,
    workspace: Flag.Directory("workspace").pipe(
      Flag.withDescription("The workspace to run in; an empty one by default"),
      Flag.optional,
    ),
    home: Flag.Directory("home").pipe(
      Flag.withDescription("The home directory to run with; an empty one by default"),
      Flag.optional,
    ),
    cliArguments: Argument.String("axm-arguments").pipe(
      Argument.withDescription("The axm arguments, after --"),
      Argument.variadic(),
    ),
  },
  (flags) =>
    Effect.gen(function* () {
      const steps = parseKeySteps(flags.steps);
      if (Result.isFailure(steps)) return yield* userError(steps.failure);
      const size = yield* resolveSize(flags.size);
      yield* runUnderTerminal({
        size,
        steps: steps.success,
        frames: flags.frames,
        workspace: Option.getOrUndefined(flags.workspace),
        home: Option.getOrUndefined(flags.home),
        cliArguments: flags.cliArguments,
      });
    }),
).pipe(
  Command.withDescription(
    "Run the CLI from source under a pseudo-terminal, replay key steps, and print the screen",
  ),
);

const newCommand = Command.make(
  "new",
  {
    view: Argument.String("view").pipe(
      Argument.withDescription(
        "The view module the fixture paints, such as apps/cli/src/root/list/view.ts",
      ),
    ),
    name: Flag.String("name").pipe(
      Flag.withDescription(
        "The fixture's name; <directory>--<module>, or <directory>--sample beside view.ts, by default",
      ),
      Flag.optional,
    ),
  },
  (flags) => newFixture(flags.view, Option.getOrUndefined(flags.name)),
).pipe(Command.withDescription("Start a gallery fixture beside a view"));

const acceptCommand = Command.make(
  "accept",
  {
    names: Argument.String("fixture").pipe(
      Argument.withDescription("The fixtures whose snapshots to record"),
      Argument.variadic({ min: 1 }),
    ),
  },
  (flags) =>
    Effect.gen(function* () {
      const gallery = yield* discoverGallery;
      yield* acceptFixtures(gallery, flags.names);
    }),
).pipe(Command.withDescription("Record the named fixtures' snapshots, leaving every other one"));

const reviewCommand = Command.make(
  "review",
  {
    base: Flag.String("base").pipe(
      Flag.withDescription("The revision to compare with"),
      Flag.withDefault("HEAD"),
    ),
    size: sizeFlag,
    ...styleFlags,
  },
  (flags) =>
    Effect.gen(function* () {
      const terminal = yield* resolveSize(flags.size);
      yield* reviewSnapshots(flags.base, terminal.columns, paintStyle(flags));
    }),
).pipe(
  Command.withDescription("Show each changed gallery snapshot before and after, side by side"),
);

const lab = Command.make("lab", { ...styleFlags }, (flags) =>
  Effect.gen(function* () {
    const gallery = yield* discoverGallery;
    yield* browseFixtures(gallery, paintStyle(flags)).pipe(Effect.provide(InteractiveScreen()));
  }),
).pipe(
  Command.withDescription(
    "Terminal design tools for the axm CLI, run from source. With no command, browse the gallery. --watch reruns any command when a source file it loaded changes.",
  ),
  Command.withSubcommands([
    listCommand,
    viewCommand,
    galleryCommand,
    askCommand,
    playCommand,
    runCommand,
    newCommand,
    acceptCommand,
    reviewCommand,
  ]),
);

/** Set in the process `--watch` starts, so it runs the command rather than watching again. */
const WATCHED = "AXM_LAB_WATCHED";

/**
 * Run the command under Bun's watcher, which restarts it whenever a module it
 * loaded changes, and end with the watcher.
 */
const watch = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const entry = new URL(import.meta.url).pathname;
    const watcher = yield* ChildProcess.make(
      "bun",
      ["--watch", "--conditions=axm-source", entry, ...args],
      {
        env: { [WATCHED]: "1" },
        extendEnv: true,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      },
    );
    yield* watcher.exitCode;
  }).pipe(Effect.scoped);

const main = Effect.gen(function* () {
  const argv = process.argv.slice(2);
  const args = argv.filter((arg) => arg !== "--watch");
  const watched = yield* Config.String(WATCHED).pipe(Config.withDefault(""));
  if (args.length !== argv.length && watched !== "1") return yield* watch(args);
  yield* Command.runWith(lab, { version: "0.0.0" })(args);
});

NodeRuntime.runMain(main.pipe(Effect.provide(NodeServices.layer)));
