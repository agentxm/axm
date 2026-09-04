import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";

import { Frame, FrameLive } from "./frame.js";
import { initialProgress, reduceProgress, type ProgressState } from "./progress.js";
import { recordedInstallLog } from "./progress.internal.test.js";
import { makeTestOutputStreams } from "./streams.js";

const stateAt = (count: number): ProgressState =>
  recordedInstallLog.slice(0, count).reduce(reduceProgress, initialProgress);

const makeHarness = (animate: boolean) => {
  const streams = makeTestOutputStreams({ stdoutIsTTY: animate, stderrIsTTY: animate });
  return {
    state: streams.state,
    layer: Layer.provide(FrameLive({ animate, quiet: false, colors: false }), streams.layer),
  };
};

describe("Frame", () => {
  it.effect("inserts transcript output above the live region and collapses at settlement", () => {
    const harness = makeHarness(true);
    return Effect.gen(function* () {
      const frame = yield* Frame;
      yield* frame.present(stateAt(12));
      yield* frame.stderr("warning\n");
      yield* frame.present(stateAt(19));
      const output = harness.state.stderr.join("");
      expect(output).toContain("Install skill — applying");
      expect(output).toContain("code-review");
      expect(output).toContain("warning\n");
      expect(output).toContain("✖ Install skill  1.5s · 1 failed\n");
      expect(output.indexOf("warning\n")).toBeLessThan(
        output.lastIndexOf("Install skill — applying"),
      );
      expect(output.lastIndexOf("Install skill — applying")).toBeLessThan(
        output.indexOf("✖ Install skill"),
      );
    }).pipe(Effect.provide(harness.layer), Effect.scoped);
  });

  it.effect("narrates transitions as static transcript lines without animation", () => {
    const harness = makeHarness(false);
    return Effect.gen(function* () {
      const frame = yield* Frame;
      for (let count = 1; count <= recordedInstallLog.length; count += 1) {
        yield* frame.present(stateAt(count));
      }
      expect(harness.state.stderr.join("")).toBe(
        [
          "● Install skill",
          "▲ Waiting — another operation holds the workspace: axm sync (pid 41)",
          "▲ Rolling back Install skill",
          "✖ Install skill  1.5s · 1 failed",
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
          yield* frame.present(stateAt(12));
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
});
