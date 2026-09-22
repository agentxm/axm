import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";

import { Frame, FrameLive } from "./frame.js";
import type { LivePlan } from "./live-ledger.js";
import { initialProgress, reduceProgress, type ProgressState } from "./progress.js";
import { recordedInstallLog } from "./progress.test.js";
import type { ScenePart } from "./scene.js";
import { makeTestOutputStreams, type TestOutputStreamsState } from "./streams.js";
import { displayWidth } from "./width.js";

const CURSOR_HIDE = "\u001b[?25l";

const stateAt = (count: number): ProgressState =>
  recordedInstallLog.slice(0, count).reduce(reduceProgress, initialProgress);

const makeHarness = (
  animate: boolean,
  terminal?: { readonly columns?: number; readonly rows?: number },
) => {
  const streams = makeTestOutputStreams({
    stdoutIsTTY: animate,
    stderrIsTTY: animate,
    ...(terminal?.columns === undefined ? {} : { columns: terminal.columns }),
    ...(terminal?.rows === undefined ? {} : { rows: terminal.rows }),
  });
  return {
    state: streams.state,
    layer: Layer.provide(FrameLive({ animate, quiet: false, colors: false }), streams.layer),
  };
};

/** A plan of `count` units none of which has started, so every row waits. */
const plan = (count: number): LivePlan => ({
  title: "Installing",
  columns: [{ header: "Extension", role: "name" }],
  rows: Array.from({ length: count }, (_, index) => ({
    id: `unit-${String(index + 1)}`,
    plannedMark: "create" as const,
    plannedStatus: "install",
    cells: [`unit ${String(index + 1)}`],
  })),
});

/** A scene part asking for `count` lines, each naming the part it belongs to. */
const part =
  (label: string, count: number): ScenePart =>
  () => [
    {
      _tag: "raw",
      content: Array.from({ length: count }, (_, index) => `${label} ${String(index + 1)}`).join(
        "\n",
      ),
    },
  ];

/** The lines standing in the live region after the frame's last write. */
const liveLines = (state: TestOutputStreamsState): ReadonlyArray<string> => {
  const last = state.stderr.at(-1) ?? "";
  const start = last.indexOf(CURSOR_HIDE);
  return start === -1 ? [] : last.slice(start + CURSOR_HIDE.length).split("\n");
};

/** Let the frame's forked fibers run, and answer with the next write they made. */
const awaitWrite = (state: TestOutputStreamsState) =>
  Effect.gen(function* () {
    const before = state.stderr.length;
    for (let turn = 0; turn < 50 && state.stderr.length === before; turn += 1) {
      yield* Effect.yieldNow;
    }
    return state.stderr[before] ?? "";
  });

describe("Frame", () => {
  it.effect("inserts transcript output above the live region and clears it at settlement", () => {
    const harness = makeHarness(true);
    return Effect.gen(function* () {
      const frame = yield* Frame;
      yield* frame.present("operation-1", stateAt(12));
      yield* frame.stderr("warning\n");
      const running = harness.state.stderr.join("");
      expect(running).toContain("Install skill");
      expect(running).toContain("code-review");
      expect(running).toContain("warning\n");
      expect(running.indexOf("warning\n")).toBeLessThan(running.lastIndexOf("code-review"));

      yield* frame.present("operation-1", stateAt(19));
      // The result ledger the command prints is the settlement, so nothing
      // about progress is left behind in the transcript.
      const afterSettlement = harness.state.stderr.join("").slice(running.length);
      expect(afterSettlement).not.toContain("code-review");
      expect(afterSettlement).not.toContain("Install skill");
      expect(liveLines(harness.state)).toEqual([]);
    }).pipe(Effect.provide(harness.layer), Effect.scoped);
  });

  it.effect("narrates transitions as static transcript lines without animation", () => {
    const harness = makeHarness(false);
    return Effect.gen(function* () {
      const frame = yield* Frame;
      for (let count = 1; count <= recordedInstallLog.length; count += 1) {
        yield* frame.present("operation-1", stateAt(count));
      }
      expect(harness.state.stderr.join("")).toBe(
        [
          " ●   Install skill",
          " ●   Resolving sources",
          " ●   Working on extension sources",
          " ●   Planning",
          " ●   Working on lockfile reconciliation",
          " ●   Validating",
          " ▲   Waiting - another operation holds the workspace: axm sync (pid 41)",
          " ●   Applying",
          " ●   Working on code-review",
          " ●   Working on deploy",
          " ▲   Rolling back Install skill",
          " ✖   Install skill                 1.5s, 1 failed",
          "",
        ].join("\n"),
      );
      expect(harness.state.stderr.join("")).not.toContain("\u001b[");
    }).pipe(Effect.provide(harness.layer), Effect.scoped);
  });

  it.effect(
    "restores the cursor and preserves transcript output when interrupted during resize",
    () => {
      const streams = makeTestOutputStreams({
        stdoutIsTTY: true,
        stderrIsTTY: true,
        resize: Stream.callback((queue) =>
          Effect.acquireRelease(
            Effect.sync(() => void Queue.offerUnsafe(queue, 64)),
            () => Effect.void,
          ),
        ),
      });
      return Effect.gen(function* () {
        const started = yield* Deferred.make<void>();
        const fiber = yield* Effect.gen(function* () {
          const frame = yield* Frame;
          yield* frame.present("operation-1", stateAt(12));
          yield* frame.stderr("warning stayed whole\n");
          yield* Deferred.succeed(started, undefined);
          return yield* Effect.never;
        }).pipe(
          Effect.provide(
            Layer.provide(FrameLive({ animate: true, quiet: false, colors: false }), streams.layer),
          ),
          Effect.scoped,
          Effect.forkChild,
        );
        yield* Deferred.await(started);
        yield* Fiber.interrupt(fiber);

        const output = streams.state.stderr.join("");
        expect(output).toContain("warning stayed whole\n");
        expect(output).toContain("Install skill");
        expect(output).toContain("\u001b[?25h");
      });
    },
  );
  it.effect("paints the ledger and the interaction as one scene within the height", () => {
    const harness = makeHarness(true, { columns: 80, rows: 16 });
    return Effect.gen(function* () {
      const frame = yield* Frame;
      yield* frame.showPlan("operation-1", plan(40));
      yield* frame.present("operation-1", stateAt(1));
      yield* frame.showInteraction(part("ask", 4));
      const lines = liveLines(harness.state);
      expect(lines).toHaveLength(14);
      expect(lines[0]).toContain("Installing");
      // Forty units cannot fit beneath a four-line question, so the window
      // folds what it cannot show rather than pushing the question off.
      expect(lines.join("\n")).toContain("more waiting");
      expect(lines.slice(-4)).toEqual(["ask 1", "ask 2", "ask 3", "ask 4"]);
    }).pipe(Effect.provide(harness.layer), Effect.scoped);
  });

  it.effect("clears a part of the scene without disturbing the other", () => {
    const harness = makeHarness(true, { columns: 80, rows: 16 });
    return Effect.gen(function* () {
      const frame = yield* Frame;
      yield* frame.showPlan("operation-1", plan(2));
      yield* frame.present("operation-1", stateAt(1));
      yield* frame.showInteraction(part("ask", 2));
      const withAsk = liveLines(harness.state);
      expect(withAsk.slice(-2)).toEqual(["ask 1", "ask 2"]);
      yield* frame.showInteraction(undefined);
      expect(liveLines(harness.state)).toEqual(withAsk.slice(0, -2));
    }).pipe(Effect.provide(harness.layer), Effect.scoped);
  });

  it.effect("restores the enclosing operation when a nested operation settles", () => {
    const harness = makeHarness(true, { columns: 80, rows: 16 });
    return Effect.gen(function* () {
      const frame = yield* Frame;
      yield* frame.showPlan("outer", { ...plan(2), title: "Installing" });
      yield* frame.present("outer", stateAt(1));
      expect(liveLines(harness.state).join("\n")).toContain("Installing");

      yield* frame.showPlan("inner", { ...plan(1), title: "Syncing" });
      yield* frame.present("inner", stateAt(1));
      expect(liveLines(harness.state).join("\n")).toContain("Syncing");

      yield* frame.present("inner", stateAt(recordedInstallLog.length));
      const restored = liveLines(harness.state).join("\n");
      expect(restored).toContain("Installing");
      expect(restored).not.toContain("Syncing");

      yield* frame.present("outer", stateAt(recordedInstallLog.length));
      expect(liveLines(harness.state)).toEqual([]);
    }).pipe(Effect.provide(harness.layer), Effect.scoped);
  });

  it.effect("paints an open question where the region cannot animate", () => {
    const streams = makeTestOutputStreams({ stdoutIsTTY: true, stderrIsTTY: true });
    return Effect.gen(function* () {
      const frame = yield* Frame;
      // Progress is silent without animation, but a question is not progress:
      // it is the thing the person has to answer.
      yield* frame.present("operation-1", stateAt(4));
      expect(liveLines(streams.state)).toEqual([]);

      yield* frame.showInteraction(part("ask", 2));
      expect(liveLines(streams.state)).toEqual(["ask 1", "ask 2"]);
    }).pipe(
      Effect.provide(
        Layer.provide(FrameLive({ animate: false, quiet: false, colors: false }), streams.layer),
      ),
      Effect.scoped,
    );
  });

  it.effect("paints an open question under quiet, which silences everything else", () => {
    const streams = makeTestOutputStreams({ stdoutIsTTY: true, stderrIsTTY: true });
    return Effect.gen(function* () {
      const frame = yield* Frame;
      yield* frame.showPlan("operation-1", plan(3));
      yield* frame.present("operation-1", stateAt(4));
      expect(liveLines(streams.state)).toEqual([]);

      yield* frame.showInteraction(part("ask", 1));
      expect(liveLines(streams.state)).toEqual(["ask 1"]);
    }).pipe(
      Effect.provide(
        Layer.provide(FrameLive({ animate: true, quiet: true, colors: false }), streams.layer),
      ),
      Effect.scoped,
    );
  });

  it.effect("keeps the region off a stream that is not a terminal", () => {
    const streams = makeTestOutputStreams({ stdoutIsTTY: false, stderrIsTTY: false });
    return Effect.gen(function* () {
      const frame = yield* Frame;
      const canInteract = yield* frame.canInteract;
      expect(canInteract).toBe(false);
      yield* frame.showInteraction(part("ask", 1));
      expect(streams.state.stderr).toEqual([]);
    }).pipe(
      Effect.provide(
        Layer.provide(FrameLive({ animate: false, quiet: false, colors: false }), streams.layer),
      ),
      Effect.scoped,
    );
  });

  it.effect("reports whether a shown plan can occupy the live region", () => {
    const visible = makeHarness(true);
    const staticFrame = makeHarness(false);
    return Effect.gen(function* () {
      expect(
        yield* Effect.flatMap(Frame, (frame) => frame.showPlan("operation-1", plan(1))).pipe(
          Effect.provide(visible.layer),
          Effect.scoped,
        ),
      ).toBe(true);
      expect(
        yield* Effect.flatMap(Frame, (frame) => frame.showPlan("operation-1", plan(1))).pipe(
          Effect.provide(staticFrame.layer),
          Effect.scoped,
        ),
      ).toBe(false);
    });
  });

  it.effect("hands the cursor back when a question it hid the cursor for leaves", () => {
    const streams = makeTestOutputStreams({ stdoutIsTTY: true, stderrIsTTY: true });
    return Effect.gen(function* () {
      const frame = yield* Frame;
      yield* frame.showInteraction(part("ask", 1));
      expect(streams.state.stderr.at(-1)).toContain(CURSOR_HIDE);

      yield* frame.showInteraction(undefined);
      expect(streams.state.stderr.at(-1)).toContain("\u001b[?25h");
    }).pipe(
      Effect.provide(
        Layer.provide(FrameLive({ animate: false, quiet: false, colors: false }), streams.layer),
      ),
      Effect.scoped,
    );
  });

  it.effect("erases the rows a narrowed terminal rewrapped, not the lines it painted", () => {
    return Effect.gen(function* () {
      const resizes = yield* Queue.unbounded<number>();
      const streams = makeTestOutputStreams({
        stdoutIsTTY: true,
        stderrIsTTY: true,
        columns: 80,
        rows: 24,
        resize: Stream.fromQueue(resizes),
      });
      yield* Effect.gen(function* () {
        const frame = yield* Frame;
        yield* frame.showInteraction(() => [{ _tag: "raw", content: "x".repeat(120) }]);
        const painted = liveLines(streams.state);
        expect(painted).toHaveLength(1);
        expect(displayWidth(painted[0] ?? "")).toBe(79);

        streams.state.size = { columns: 60, rows: 24 };
        Queue.offerUnsafe(resizes, 60);
        const repaint = yield* awaitWrite(streams.state);

        // The one painted line stands on two rows at sixty columns, so the
        // erase reaches up one row and clears to the end of the screen.
        expect(repaint.startsWith("\r\u001b[1A\u001b[0J")).toBe(true);
        expect(displayWidth(liveLines(streams.state)[0] ?? "")).toBe(59);
      }).pipe(
        Effect.provide(
          Layer.provide(FrameLive({ animate: true, quiet: false, colors: false }), streams.layer),
        ),
        Effect.scoped,
      );
    });
  });
});
