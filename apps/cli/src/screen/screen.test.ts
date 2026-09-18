import { describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Terminal from "effect/Terminal";

import { nonInteractiveFlag } from "../cli-flags/non-interactive.js";
import { FrameLive } from "./frame.js";
import { Screen, ScreenLive } from "./screen.js";
import { makeTestOutputStreams } from "./streams.js";
import type { WaitView } from "./wait/wait.js";

const gate = {
  _tag: "Confirm",
  question: "Apply changes?",
  choices: [
    { key: "n", word: "no", value: "declined" },
    { key: "y", word: "yes", value: "approved" },
  ],
} as const;

const wait: WaitView = {
  subject: "device-authorization",
  detail: "waiting on you",
  label: "Device sign-in",
  status: "Waiting for approval",
  brief: [{ _tag: "paragraph", text: "Open the browser." }],
};

const makeLayer = (
  options: { readonly stderrIsTTY: boolean; readonly nonInteractive: boolean },
  onRead: () => void,
) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const keys = yield* Queue.make<Terminal.UserInput, Cause.Done>();
      const streams = makeTestOutputStreams({
        stdoutIsTTY: true,
        stderrIsTTY: options.stderrIsTTY,
      });
      const terminal = Layer.succeed(
        Terminal.Terminal,
        Terminal.make({
          columns: Effect.succeed(80),
          rows: Effect.succeed(24),
          readInput: Effect.sync(() => {
            onRead();
            return Queue.asDequeue(keys);
          }),
          readLine: Effect.succeed(""),
          display: () => Effect.void,
        }),
      );
      const frame = Layer.provide(
        FrameLive({ animate: true, quiet: false, colors: false }),
        streams.layer,
      );
      return Layer.provide(
        ScreenLive({
          colors: { stdout: false, stderr: false },
          animate: true,
        }),
        Layer.mergeAll(
          frame,
          streams.layer,
          terminal,
          Layer.succeed(nonInteractiveFlag, Option.some(options.nonInteractive)),
        ),
      );
    }),
  );

describe("Screen interaction availability", () => {
  it.effect("refuses a prompt when stderr cannot paint it", () => {
    let reads = 0;
    return Effect.gen(function* () {
      const screen = yield* Screen;
      const failure = yield* screen.ask(gate, { message: "Approval required." }).pipe(Effect.flip);

      expect(failure).toMatchObject({
        code: "usage",
        detail: "Interactive prompt required: Approval required.",
      });
      expect(reads).toBe(0);
    }).pipe(
      Effect.provide(
        makeLayer({ stderrIsTTY: false, nonInteractive: false }, () => {
          reads += 1;
        }),
      ),
      Effect.scoped,
    );
  });

  it.effect("keeps a wait static when the invocation is non-interactive", () => {
    let reads = 0;
    return Effect.gen(function* () {
      const screen = yield* Screen;
      expect(yield* screen.wait(wait, Effect.succeed("approved"))).toBe("approved");
      expect(reads).toBe(0);
    }).pipe(
      Effect.provide(
        makeLayer({ stderrIsTTY: true, nonInteractive: true }, () => {
          reads += 1;
        }),
      ),
      Effect.scoped,
    );
  });
});
