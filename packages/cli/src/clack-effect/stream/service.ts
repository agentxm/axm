import * as p from "@clack/prompts";
import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import { makeAppError, type AppError } from "../../app-error/index.js";

export class ClackStream extends ServiceMap.Service<
  ClackStream,
  {
    readonly message: <E, R>(
      stream: Stream.Stream<string, E, R>,
    ) => Effect.Effect<void, AppError | E, R>;
    readonly info: <E, R>(
      stream: Stream.Stream<string, E, R>,
    ) => Effect.Effect<void, AppError | E, R>;
    readonly success: <E, R>(
      stream: Stream.Stream<string, E, R>,
    ) => Effect.Effect<void, AppError | E, R>;
    readonly step: <E, R>(
      stream: Stream.Stream<string, E, R>,
    ) => Effect.Effect<void, AppError | E, R>;
    readonly warn: <E, R>(
      stream: Stream.Stream<string, E, R>,
    ) => Effect.Effect<void, AppError | E, R>;
    readonly error: <E, R>(
      stream: Stream.Stream<string, E, R>,
    ) => Effect.Effect<void, AppError | E, R>;
  }
>()("@axm.sh/cli/clack-effect/ClackStream") {}

const wrapStreamMethod =
  (method: (iter: Iterable<string>) => Promise<void>) =>
  <E, R>(stream: Stream.Stream<string, E, R>): Effect.Effect<void, AppError | E, R> =>
    Effect.gen(function* () {
      const arr = yield* Stream.runCollect(stream);
      yield* Effect.tryPromise({
        try: () => method(arr),
        catch: (error) =>
          makeAppError({
            code: "STREAM_RENDER_FAILED",
            what: "Stream rendering failed",
            cause: error,
          }),
      });
    });

const makeLiveClackStreamService = (): ServiceMap.Service.Shape<typeof ClackStream> => ({
  message: wrapStreamMethod((iter) => p.stream.message(iter)),
  info: wrapStreamMethod((iter) => p.stream.info(iter)),
  success: wrapStreamMethod((iter) => p.stream.success(iter)),
  step: wrapStreamMethod((iter) => p.stream.step(iter)),
  warn: wrapStreamMethod((iter) => p.stream.warn(iter)),
  error: wrapStreamMethod((iter) => p.stream.error(iter)),
});

export const ClackStreamLive: Layer.Layer<ClackStream> = Layer.succeed(
  ClackStream,
  makeLiveClackStreamService(),
);
