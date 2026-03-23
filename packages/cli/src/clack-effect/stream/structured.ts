import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import { ClackStream } from "./service.js";
import { emitEvent, type OutputFormat } from "../../output.js";

type StructuredMode = Exclude<OutputFormat, "text">;

const makeStructuredClackStreamService = (
  mode: StructuredMode,
): ServiceMap.Service.Shape<typeof ClackStream> => {
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

  return {
    message: collectAndLog("info"),
    info: collectAndLog("info"),
    success: collectAndLog("info"),
    step: collectAndLog("info"),
    warn: collectAndLog("warn"),
    error: collectAndLog("error"),
  };
};

export const ClackStreamStructured = (mode: StructuredMode): Layer.Layer<ClackStream> =>
  Layer.succeed(ClackStream, makeStructuredClackStreamService(mode));
