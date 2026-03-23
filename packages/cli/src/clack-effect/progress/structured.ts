import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ClackProgress } from "./service.js";
import type { ClackProgressHandle } from "./types.js";
import { emitEvent, type OutputFormat } from "../../output.js";

type StructuredMode = Exclude<OutputFormat, "text">;

const noopHandle: ClackProgressHandle = {
  stop: () => Effect.void,
  message: () => Effect.void,
  cancel: () => Effect.void,
  error: () => Effect.void,
  clear: () => Effect.void,
  advance: () => Effect.void,
};

const makeStreamHandle = (phase: string, max: number): ClackProgressHandle => {
  let current = 0;
  return {
    stop: (message) =>
      message ? emitEvent({ type: "progress", phase, percent: 100, message }) : Effect.void,
    message: (message) =>
      message
        ? emitEvent({
            type: "progress",
            phase,
            percent: Math.round((current / max) * 100),
            message,
          })
        : Effect.void,
    cancel: (message) =>
      emitEvent({ type: "progress", phase, percent: -1, message: message ?? "Cancelled" }),
    error: (message) => emitEvent({ type: "log", level: "error", message: message ?? "Error" }),
    clear: () => Effect.void,
    advance: (step, message) => {
      current = Math.min(current + (step ?? 1), max);
      const percent = Math.round((current / max) * 100);
      return message ? emitEvent({ type: "progress", phase, percent, message }) : Effect.void;
    },
  };
};

const makeStructuredClackProgressService = (
  mode: StructuredMode,
): ServiceMap.Service.Shape<typeof ClackProgress> => ({
  start: (config, message) => {
    if (mode === "stream-json" && message) {
      const max = config.max ?? 100;
      return emitEvent({ type: "progress", phase: "progress", percent: 0, message }).pipe(
        Effect.as(makeStreamHandle("progress", max)),
      );
    }
    return Effect.succeed(noopHandle);
  },

  withProgress: (config, message, f, stopMessage) => {
    if (mode !== "stream-json") {
      return f(noopHandle);
    }

    const max = config.max ?? 100;
    const handle = makeStreamHandle("progress", max);
    return emitEvent({ type: "progress", phase: "progress", percent: 0, message }).pipe(
      Effect.andThen(f(handle)),
      Effect.tap(() =>
        emitEvent({
          type: "progress",
          phase: "progress",
          percent: 100,
          message: stopMessage ?? message,
        }),
      ),
    );
  },
});

export const ClackProgressStructured = (mode: StructuredMode): Layer.Layer<ClackProgress> =>
  Layer.succeed(ClackProgress, makeStructuredClackProgressService(mode));
