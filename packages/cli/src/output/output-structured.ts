import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { emitEvent, type OutputFormat } from "../output.js";
import { Output, type StreamLevel } from "./output.js";

type StructuredMode = Exclude<OutputFormat, "text">;

export const OutputStructured = (mode: StructuredMode): Layer.Layer<Output> => {
  const logEvent = (level: "info" | "warn" | "error", message: string): Effect.Effect<void> =>
    mode === "stream-json"
      ? emitEvent({ type: "log", level, message })
      : Effect.sync(() => console.error(message));

  const collectAndLog =
    (level: "info" | "warn" | "error") =>
    <E, R>(stream: Stream.Stream<string, E, R>): Effect.Effect<void, E, R> =>
      Stream.runCollect(stream).pipe(
        Effect.flatMap((chunks) => {
          const message = Array.from(chunks).join("");
          return mode === "stream-json"
            ? emitEvent({ type: "log", level, message })
            : Effect.sync(() => console.error(message));
        }),
      );

  const levelToLogLevel = (level: StreamLevel): "info" | "warn" | "error" => {
    if (level === "warn") return "warn";
    if (level === "error") return "error";
    return "info";
  };

  return Layer.succeed(Output, {
    message: (message) => logEvent("info", message),
    info: (message) => logEvent("info", message),
    success: (message) => logEvent("info", message),
    step: (message) => logEvent("info", message),
    warn: (message) => logEvent("warn", message),
    error: (message) => logEvent("error", message),
    intro: (title) => (title ? logEvent("info", title) : Effect.void),
    outro: (message) => (message ? logEvent("info", message) : Effect.void),
    cancel: (message) => (message ? logEvent("info", message) : Effect.void),
    note: (message, title) => logEvent("info", title ? `${title}: ${message}` : message),
    box: (message, title) => logEvent("info", title ? `${title}: ${message}` : message),

    stream: (level, stream) => collectAndLog(levelToLogLevel(level))(stream),

    result: <A, I>(
      schema: Schema.Codec<A, I>,
      data: A,
      _textRenderer: (data: A) => string,
    ) =>
      Effect.gen(function* () {
        switch (mode) {
          case "json": {
            const encoded = Schema.encodeSync(schema)(data);
            yield* Console.log(JSON.stringify(encoded));
            break;
          }
          case "stream-json": {
            const encoded = Schema.encodeSync(schema)(data);
            yield* Console.log(JSON.stringify({ type: "result", data: encoded }));
            break;
          }
        }
      }),
  });
};
