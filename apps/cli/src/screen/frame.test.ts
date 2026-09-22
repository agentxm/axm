import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";

import { Frame, FrameLive, type ActiveView } from "./frame.js";
import { makeTestOutputStreams } from "./streams.js";
import {
  makeTerminalReplay,
  replayBytes,
  terminalTranscript,
} from "../test-support/terminal-replay.js";

const active = (text: string, kind: ActiveView["kind"] = "activity"): ActiveView => ({
  owner: Symbol(text),
  kind,
  part: () => [{ _tag: "raw", content: text }],
});

const harness = (options?: { animate?: boolean; quiet?: boolean; tty?: boolean }) => {
  const streams = makeTestOutputStreams({
    stdoutIsTTY: options?.tty ?? true,
    stderrIsTTY: options?.tty ?? true,
  });
  return {
    ...streams,
    layer: Layer.provide(
      FrameLive({
        animate: options?.animate ?? true,
        quiet: options?.quiet ?? false,
        colors: false,
      }),
      streams.layer,
    ),
  };
};

describe("Frame transcript ownership", () => {
  it.effect("preserves committed history across replacement, logs and settlement", () => {
    const h = harness();
    return Effect.gen(function* () {
      const terminal = yield* makeTerminalReplay();
      const frame = yield* Frame;
      const first = active("Checking sources…");
      yield* frame.stderr("Updating extensions\n");
      yield* frame.updateActive(first);
      yield* frame.stderr("A warning stays here\n");
      yield* frame.finishActive(first.owner, "Checked sources\n", active("Applying changes…"));
      yield* frame.updateActive(undefined, "Finished applying changes\n");
      yield* frame.settle;
      yield* replayBytes(terminal, h.state.stderr.join(""));
      expect(terminalTranscript(terminal)).toBe(
        "Updating extensions\nA warning stays here\nChecked sources\nFinished applying changes",
      );
    }).pipe(Effect.provide(h.layer), Effect.scoped);
  });

  it.effect("does not let stale owners remove a newer question", () => {
    const h = harness();
    return Effect.gen(function* () {
      const terminal = yield* makeTerminalReplay();
      const frame = yield* Frame;
      const old = active("old", "interaction");
      const current = active("Choose agents", "interaction");
      yield* frame.updateActive(old);
      yield* frame.updateActive(current);
      yield* frame.finishActive(old.owner, "wrong answer\n");
      yield* frame.finishActive(old.owner, "");
      yield* replayBytes(terminal, h.state.stderr.join(""));
      expect(terminalTranscript(terminal)).toBe("Choose agents");
      yield* frame.finishActive(current.owner, "Agents: editor\n");
    }).pipe(Effect.provide(h.layer), Effect.scoped);
  });

  it.effect("preserves a transcript longer than the viewport", () => {
    const h = harness();
    return Effect.gen(function* () {
      const terminal = yield* makeTerminalReplay(80, 4);
      const frame = yield* Frame;
      h.state.size = { columns: 80, rows: 4 };
      const history = Array.from({ length: 80 }, (_, i) => `Completed phase ${String(i)}`);
      for (const line of history) {
        yield* frame.updateActive(active("Current activity"), `${line}\n`);
      }
      yield* frame.settle;
      yield* replayBytes(terminal, h.state.stderr.join(""));
      expect(terminalTranscript(terminal)).toBe(history.join("\n"));
      for (const control of ["\u001b[2J", "\u001b[3J", "\u001b[?1049h"]) {
        expect(h.state.stderr.join("")).not.toContain(control);
      }
    }).pipe(Effect.provide(h.layer), Effect.scoped);
  });

  it.effect("leaves exact raw output without a newline and suspends repainting", () => {
    const h = harness();
    return Effect.gen(function* () {
      const frame = yield* Frame;
      yield* frame.updateActive(active("Working"));
      yield* frame.stdout("raw-value");
      const count = h.state.stderr.length;
      yield* frame.updateActive(active("Still working"));
      yield* frame.settle;
      expect(h.state.stdout.join("")).toBe("raw-value");
      expect(h.state.stderr.slice(count).join("")).not.toContain("Still working");
    }).pipe(Effect.provide(h.layer), Effect.scoped);
  });

  for (const options of [{ animate: false }, { quiet: true }]) {
    it.effect(`keeps questions usable with ${JSON.stringify(options)}`, () => {
      const h = harness(options);
      return Effect.gen(function* () {
        const terminal = yield* makeTerminalReplay();
        const frame = yield* Frame;
        yield* frame.updateActive(active("Hidden activity"));
        yield* frame.updateActive(active("Answer this question", "interaction"));
        yield* replayBytes(terminal, h.state.stderr.join(""));
        expect(terminalTranscript(terminal)).toBe("Answer this question");
      }).pipe(Effect.provide(h.layer), Effect.scoped);
    });
  }

  it.effect("never paints control bytes to a pipe", () => {
    const h = harness({ tty: false });
    return Effect.gen(function* () {
      const frame = yield* Frame;
      expect(yield* frame.canInteract).toBe(false);
      yield* frame.updateActive(active("Hidden", "interaction"), "Visible milestone\n");
      yield* frame.settle;
      expect(h.state.stderr.join("")).toBe("Visible milestone\n");
    }).pipe(Effect.provide(h.layer), Effect.scoped);
  });

  it.effect("preserves committed text through resize without trusting old cursor geometry", () =>
    Effect.gen(function* () {
      const resizes = yield* Queue.unbounded<number>();
      const streams = makeTestOutputStreams({
        stdoutIsTTY: true,
        stderrIsTTY: true,
        resize: Stream.fromQueue(resizes),
      });
      const terminal = yield* makeTerminalReplay();
      yield* Effect.gen(function* () {
        const frame = yield* Frame;
        yield* frame.stderr("History must survive\n");
        yield* frame.updateActive(active("x".repeat(75), "interaction"));
        yield* replayBytes(terminal, streams.state.stderr.join(""));
        const written = streams.state.stderr.length;
        terminal.resize(20, 4);
        streams.state.size = { columns: 20, rows: 4 };
        yield* Queue.offer(resizes, 20);
        for (let i = 0; i < 50 && streams.state.stderr.length === written; i += 1)
          yield* Effect.yieldNow;
        yield* frame.updateActive(active("New controls", "interaction"));
        yield* frame.settle;
        yield* replayBytes(terminal, streams.state.stderr.slice(written).join(""));
        expect(terminalTranscript(terminal)).toContain("History must survive");
        expect(streams.state.stderr[written]).toBe("\r\n");
      }).pipe(
        Effect.provide(
          Layer.provide(FrameLive({ animate: false, quiet: false, colors: false }), streams.layer),
        ),
        Effect.scoped,
      );
    }).pipe(Effect.scoped),
  );
});
