import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ClackSpinner, type ClackSpinnerOptions } from "./service.js";
import type { ClackSpinnerHandle } from "./types.js";
import { emitEvent, type OutputFormat } from "../../output.js";

type StructuredMode = Exclude<OutputFormat, "text">;

const noopHandle: ClackSpinnerHandle = {
  stop: () => Effect.void,
  message: () => Effect.void,
  cancel: () => Effect.void,
  error: () => Effect.void,
  clear: () => Effect.void,
};

const makeStreamHandle = (phase: string): ClackSpinnerHandle => ({
  stop: (message) =>
    message ? emitEvent({ type: "progress", phase, percent: 100, message }) : Effect.void,
  message: (message) =>
    message ? emitEvent({ type: "progress", phase, percent: -1, message }) : Effect.void,
  cancel: (message) =>
    emitEvent({ type: "progress", phase, percent: -1, message: message ?? "Cancelled" }),
  error: (message) => emitEvent({ type: "log", level: "error", message: message ?? "Error" }),
  clear: () => Effect.void,
});

const resolveSuccessMessage = <A>(
  options: string | ClackSpinnerOptions<A> | undefined,
  value: A,
  fallback: string,
): string => {
  if (typeof options === "string") return options;
  if (typeof options?.successMessage === "string") return options.successMessage;
  if (typeof options?.successMessage === "function") return options.successMessage(value);
  return fallback;
};

const makeStructuredClackSpinnerService = (
  mode: StructuredMode,
): ServiceMap.Service.Shape<typeof ClackSpinner> => ({
  start: (message) => {
    if (mode === "stream-json" && message) {
      return emitEvent({ type: "progress", phase: "start", percent: 0, message }).pipe(
        Effect.as(makeStreamHandle("start")),
      );
    }
    return Effect.succeed(noopHandle);
  },

  withSpinner: (message, f, options) => {
    if (mode !== "stream-json") {
      return f(noopHandle);
    }

    const handle = makeStreamHandle("work");
    return emitEvent({ type: "progress", phase: "work", percent: 0, message }).pipe(
      Effect.andThen(f(handle)),
      Effect.tap((a) =>
        emitEvent({
          type: "progress",
          phase: "work",
          percent: 100,
          message: resolveSuccessMessage(options, a, message),
        }),
      ),
    );
  },
});

export const ClackSpinnerStructured = (mode: StructuredMode): Layer.Layer<ClackSpinner> =>
  Layer.succeed(ClackSpinner, makeStructuredClackSpinnerService(mode));
