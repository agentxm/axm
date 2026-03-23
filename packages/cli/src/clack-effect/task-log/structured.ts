import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ClackTaskLog } from "./service.js";
import type { ClackTaskLogGroupHandle, ClackTaskLogHandle } from "./types.js";
import { emitEvent, type OutputFormat } from "../../output.js";

type StructuredMode = Exclude<OutputFormat, "text">;

const makeStructuredClackTaskLogService = (
  mode: StructuredMode,
): ServiceMap.Service.Shape<typeof ClackTaskLog> => {
  const logMsg = (message: string): Effect.Effect<void> =>
    mode === "stream-json"
      ? emitEvent({ type: "log", level: "info", message })
      : Effect.sync(() => console.error(message));

  const makeGroupHandle = (name: string): ClackTaskLogGroupHandle => ({
    message: (msg) => logMsg(`[${name}] ${msg}`),
    error: (message) =>
      mode === "stream-json"
        ? emitEvent({ type: "log", level: "error", message: `[${name}] ${message}` })
        : Effect.sync(() => console.error(`[${name}] ${message}`)),
    success: (message) => logMsg(`[${name}] ${message}`),
  });

  const makeHandle = (title: string): ClackTaskLogHandle => ({
    message: (msg) => logMsg(`[${title}] ${msg}`),
    group: (name) => Effect.succeed(makeGroupHandle(name)),
    error: (message) =>
      mode === "stream-json"
        ? emitEvent({ type: "log", level: "error", message: `[${title}] ${message}` })
        : Effect.sync(() => console.error(`[${title}] ${message}`)),
    success: (message) => logMsg(`[${title}] ${message}`),
  });

  return {
    start: (config) => Effect.succeed(makeHandle(config.title)),
  };
};

export const ClackTaskLogStructured = (mode: StructuredMode): Layer.Layer<ClackTaskLog> =>
  Layer.succeed(ClackTaskLog, makeStructuredClackTaskLogService(mode));
