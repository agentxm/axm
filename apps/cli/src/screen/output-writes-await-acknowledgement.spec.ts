// @effect-diagnostics nodeBuiltinImport:off — the native output boundary is exercised against Node Writable semantics
import { Writable } from "node:stream";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Exit from "effect/Exit";
import * as Cause from "effect/Cause";
import { writeOutput } from "./streams.js";
import { defineSpecification } from "@agentxm/specification-metadata";

export const specification = defineSpecification({
  requirement: "cli/output-writes-await-acknowledgement",
  title: "Output writes await delivery acknowledgement",
  statement:
    "The CLI shall await native output acknowledgement before reporting a write as delivered, preserve delivery failures as typed failures without exposing output content, and release per-write listeners on completion or interruption while preserving interruption.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const eventLoopTurn = Effect.callback<void>((resume) => {
  setImmediate(() => resume(Effect.void));
});

const controlledStream = (highWaterMark = 16_384) => {
  const callbacks: Array<(error?: Error | null) => void> = [];
  const stream = new Writable({
    highWaterMark,
    write: (_chunk, _encoding, callback) => {
      callbacks.push(callback);
    },
  });
  return {
    stream,
    finish: (error?: Error) => {
      const callback = callbacks.shift();
      if (callback === undefined) throw new Error("Expected a pending native write");
      callback(error);
    },
  };
};

const brokenPipe = () =>
  Object.assign(new Error("private output must never be copied"), { code: "EPIPE" });

describe("native output acknowledgement", () => {
  for (const highWaterMark of [1, 16_384]) {
    it.effect(`waits for acknowledgement with a ${highWaterMark}-byte backpressure threshold`, () =>
      Effect.gen(function* () {
        const { stream, finish } = controlledStream(highWaterMark);
        const fiber = yield* writeOutput(stream, "stdout", "result").pipe(Effect.forkChild);
        yield* Effect.yieldNow;
        expect(fiber.pollUnsafe()).toBeUndefined();
        expect(stream.listenerCount("error")).toBe(1);
        finish();
        yield* Fiber.join(fiber);
        expect(stream.listenerCount("error")).toBe(0);
      }),
    );

    it.effect(`keeps a late callback failure typed at threshold ${highWaterMark}`, () =>
      Effect.gen(function* () {
        const { stream, finish } = controlledStream(highWaterMark);
        const fiber = yield* writeOutput(stream, "stdout", "sensitive content").pipe(
          Effect.forkChild,
        );
        yield* Effect.yieldNow;
        finish(brokenPipe());
        const failure = yield* Effect.flip(Fiber.join(fiber));
        expect(failure).toMatchObject({
          _tag: "OutputWriteFailed",
          channel: "stdout",
          reason: "EPIPE",
        });
        expect(JSON.stringify(failure)).not.toContain("sensitive content");
        expect(JSON.stringify(failure)).not.toContain("private output");
        yield* eventLoopTurn;
        expect(stream.listenerCount("error")).toBe(0);
      }),
    );
  }

  it.effect("keeps synchronous foreign throws typed and removes the listener", () =>
    Effect.gen(function* () {
      const { stream } = controlledStream();
      const throwing = {
        write: () => {
          throw brokenPipe();
        },
        on: stream.on.bind(stream),
        off: stream.off.bind(stream),
        once: stream.once.bind(stream),
        destroyed: false,
        writableEnded: false,
      };
      const failure = yield* Effect.flip(writeOutput(throwing, "stderr", "diagnostic"));
      expect(failure).toMatchObject({ channel: "stderr", reason: "EPIPE" });
      expect(stream.listenerCount("error")).toBe(0);
    }),
  );

  it.effect("handles a native error event once and cleans up the write listener", () =>
    Effect.gen(function* () {
      const { stream } = controlledStream();
      const fiber = yield* writeOutput(stream, "stderr", "diagnostic").pipe(Effect.forkChild);
      yield* Effect.yieldNow;
      stream.emit("error", brokenPipe());
      expect((yield* Effect.flip(Fiber.join(fiber))).reason).toBe("EPIPE");
      expect(stream.listenerCount("error")).toBe(0);
    }),
  );

  for (const lateFailure of [false, true]) {
    it.effect(
      `removes the write listener on interruption and handles late completion (${lateFailure})`,
      () =>
        Effect.gen(function* () {
          const { stream, finish } = controlledStream();
          const fiber = yield* writeOutput(stream, "stdout", "result").pipe(Effect.forkChild);
          yield* Effect.yieldNow;
          yield* Fiber.interrupt(fiber);
          const exit = yield* Fiber.await(fiber);
          expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true);
          expect(stream.listenerCount("error")).toBe(0);
          finish(lateFailure ? brokenPipe() : undefined);
          yield* eventLoopTurn;
          expect(stream.listenerCount("error")).toBe(0);
        }),
    );
  }
});
