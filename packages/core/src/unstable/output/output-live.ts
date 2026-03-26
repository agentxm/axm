import * as p from "@clack/prompts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import { makeAppError } from "../app-error/index.js";
import { Output, type StreamLevel } from "./output.js";

const streamMethodMap: Record<StreamLevel, (iter: Iterable<string>) => Promise<void>> = {
  message: (iter) => p.stream.message(iter),
  info: (iter) => p.stream.info(iter),
  success: (iter) => p.stream.success(iter),
  step: (iter) => p.stream.step(iter),
  warn: (iter) => p.stream.warn(iter),
  error: (iter) => p.stream.error(iter),
};

export const OutputLive = (): Layer.Layer<Output> =>
  Layer.succeed(Output, {
    message: (message) => Effect.sync(() => p.log.message(message)),
    info: (message) => Effect.sync(() => p.log.info(message)),
    success: (message) => Effect.sync(() => p.log.success(message)),
    step: (message) => Effect.sync(() => p.log.step(message)),
    warn: (message) => Effect.sync(() => p.log.warn(message)),
    error: (message) => Effect.sync(() => p.log.error(message)),
    intro: (title) => Effect.sync(() => p.intro(title)),
    outro: (message) => Effect.sync(() => p.outro(message)),
    cancel: (message) => Effect.sync(() => p.cancel(message)),
    note: (message, title) => Effect.sync(() => p.note(message, title)),
    box: (message, title, opts) => Effect.sync(() => p.box(message, title, opts)),

    stream: <E, R>(level: StreamLevel, stream: Stream.Stream<string, E, R>) =>
      Stream.runCollect(stream).pipe(
        Effect.flatMap((arr) =>
          Effect.tryPromise({
            try: () => streamMethodMap[level](arr),
            catch: (error) =>
              makeAppError({
                code: "STREAM_RENDER_FAILED",
                what: "Stream rendering failed",
                cause: error,
              }),
          }),
        ),
      ),
  });
