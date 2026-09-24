import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
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
  options: { readonly stderrIsTTY: boolean; readonly nonInteractive: boolean | undefined },
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
      // The screen reads the flags in the caller's context when asked, as the
      // runtime provides them, so they are merged alongside it.
      return Layer.provideMerge(
        ScreenLive({
          colors: { stdout: false, stderr: false },
          animate: true,
        }),
        Layer.mergeAll(
          frame,
          streams.layer,
          terminal,
          Layer.succeed(nonInteractiveFlag, Option.fromUndefinedOr(options.nonInteractive)),
        ),
      );
    }),
  );

describe("Screen interaction availability", () => {
  // The one decision planning and handlers read: the flags allow a prompt and
  // the frame can paint one.
  it.effect.each([
    { stderrIsTTY: true, nonInteractive: false, expected: true },
    { stderrIsTTY: false, nonInteractive: false, expected: false },
    { stderrIsTTY: true, nonInteractive: true, expected: false },
  ])(
    "answers canAsk $expected with stderr tty=$stderrIsTTY and non-interactive=$nonInteractive",
    ({ stderrIsTTY, nonInteractive, expected }) =>
      Effect.gen(function* () {
        const screen = yield* Screen;
        expect(yield* screen.canAsk).toBe(expected);
      }).pipe(
        Effect.provide(makeLayer({ stderrIsTTY, nonInteractive }, () => undefined)),
        Effect.scoped,
      ),
  );

  it.effect("fails unreadable CI configuration before opening a prompt", () => {
    let reads = 0;
    const sourceError = new ConfigProvider.SourceError({ message: "source unavailable" });
    return Effect.gen(function* () {
      const screen = yield* Screen;
      const failure = yield* screen.ask(gate).pipe(Effect.flip);
      expect(failure._tag).toBe("ConfigError");
      if (failure._tag === "ConfigError") expect(failure.cause).toBe(sourceError);
      expect(reads).toBe(0);
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          makeLayer({ stderrIsTTY: true, nonInteractive: undefined }, () => {
            reads += 1;
          }),
          ConfigProvider.layer(ConfigProvider.make(() => Effect.fail(sourceError))),
        ),
      ),
      Effect.scoped,
    );
  });

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
