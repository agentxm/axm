import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ClackLog } from "./service.js";
import { emitEvent, type OutputFormat } from "../../output.js";

type StructuredMode = Exclude<OutputFormat, "text">;

const makeStructuredClackLogService = (
  mode: StructuredMode,
): ServiceMap.Service.Shape<typeof ClackLog> => {
  const logEvent = (level: "info" | "warn" | "error", message: string): Effect.Effect<void> =>
    mode === "stream-json"
      ? emitEvent({ type: "log", level, message })
      : Effect.sync(() => console.error(message));

  return {
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
  };
};

export const ClackLogStructured = (mode: StructuredMode): Layer.Layer<ClackLog> =>
  Layer.succeed(ClackLog, makeStructuredClackLogService(mode));
