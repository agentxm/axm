import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as MutableRef from "effect/MutableRef";
import * as Queue from "effect/Queue";
import * as References from "effect/References";
import * as Stream from "effect/Stream";

import { redactSensitiveValue } from "../app-error/secret-redaction.js";
import { verbosityToLogLevel, type VerbosityLevel } from "../cli-flags/index.js";
import { Screen, type ScreenLogRecord } from "./screen.js";

const messageText = (message: unknown): string => {
  const redacted = redactSensitiveValue(message);
  if (typeof redacted === "string") return redacted;
  if (Array.isArray(redacted)) {
    return redacted
      .map((part) => (typeof part === "string" ? part : (JSON.stringify(part) ?? String(part))))
      .join(" ");
  }
  return JSON.stringify(redacted) ?? String(redacted);
};

const level = (value: Logger.Options<unknown>["logLevel"]): ScreenLogRecord["level"] => {
  switch (value) {
    case "Trace":
      return "trace";
    case "Debug":
      return "debug";
    case "Info":
      return "info";
    case "Warn":
      return "warn";
    case "Error":
      return "error";
    case "Fatal":
      return "fatal";
    case "None":
    case "All":
      return "info";
  }
};

/** Install the Effect logger as a serialized producer into the Screen transcript. */
export const ScreenLoggerLive = (verbosity: VerbosityLevel): Layer.Layer<never, never, Screen> =>
  Layer.mergeAll(
    Logger.layer(
      [
        Effect.gen(function* () {
          const screen = yield* Screen;
          const queue = yield* Queue.unbounded<ScreenLogRecord>();
          const pending = MutableRef.make(0);
          yield* Stream.fromQueue(queue).pipe(
            Stream.runForEach((record) =>
              screen
                .log(record)
                .pipe(Effect.ensuring(Effect.sync(() => void MutableRef.decrementAndGet(pending)))),
            ),
            Effect.forkScoped,
          );
          const awaitDrained: Effect.Effect<void> = Effect.suspend(() =>
            MutableRef.get(pending) === 0
              ? Effect.void
              : Effect.yieldNow.pipe(Effect.andThen(awaitDrained)),
          );
          yield* Effect.addFinalizer(() =>
            awaitDrained.pipe(Effect.andThen(Queue.shutdown(queue)), Effect.asVoid),
          );
          return Logger.make<unknown, void>((options) => {
            MutableRef.incrementAndGet(pending);
            const offered = Queue.offerUnsafe(queue, {
              level: level(options.logLevel),
              message: messageText(options.message),
            });
            if (!offered) MutableRef.decrementAndGet(pending);
          });
        }),
      ],
      { mergeWithExisting: false },
    ),
    Layer.succeed(References.LogToStderr, true),
    Layer.succeed(References.MinimumLogLevel, verbosityToLogLevel(verbosity)),
  );
