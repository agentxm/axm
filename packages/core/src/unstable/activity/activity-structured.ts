import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  Activity,
  type SpinnerHandle,
  type SpinnerOptions,
  type ProgressHandle,
  type TaskLogGroupHandle,
  type TaskLogHandle,
} from "./activity.js";
import { emitEvent, type OutputFormat } from "../output-format.js";

type StructuredMode = Exclude<OutputFormat, "text">;

const noopSpinnerHandle: SpinnerHandle = {
  stop: () => Effect.void,
  message: () => Effect.void,
  cancel: () => Effect.void,
  error: () => Effect.void,
  clear: () => Effect.void,
};

const noopProgressHandle: ProgressHandle = {
  ...noopSpinnerHandle,
  advance: () => Effect.void,
};

const makeStreamSpinnerHandle = (phase: string): SpinnerHandle => ({
  stop: (message) =>
    message ? emitEvent({ type: "progress", phase, percent: 100, message }) : Effect.void,
  message: (message) =>
    message ? emitEvent({ type: "progress", phase, percent: -1, message }) : Effect.void,
  cancel: (message) =>
    emitEvent({ type: "progress", phase, percent: -1, message: message ?? "Cancelled" }),
  error: (message) => emitEvent({ type: "log", level: "error", message: message ?? "Error" }),
  clear: () => Effect.void,
});

const makeStreamProgressHandle = (phase: string, max: number): ProgressHandle => {
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

const resolveSuccessMessage = <A>(
  options: string | SpinnerOptions<A> | undefined,
  value: A,
  fallback: string,
): string => {
  if (typeof options === "string") return options;
  if (typeof options?.successMessage === "string") return options.successMessage;
  if (typeof options?.successMessage === "function") return options.successMessage(value);
  return fallback;
};

const makeStructuredTaskLogGroupHandle = (
  mode: StructuredMode,
  name: string,
): TaskLogGroupHandle => {
  const logMsg = (message: string): Effect.Effect<void> =>
    mode === "stream-json"
      ? emitEvent({ type: "log", level: "info", message })
      : Effect.sync(() => console.error(message));

  return {
    message: (msg) => logMsg(`[${name}] ${msg}`),
    error: (message) =>
      mode === "stream-json"
        ? emitEvent({ type: "log", level: "error", message: `[${name}] ${message}` })
        : Effect.sync(() => console.error(`[${name}] ${message}`)),
    success: (message) => logMsg(`[${name}] ${message}`),
  };
};

const makeStructuredTaskLogHandle = (mode: StructuredMode, title: string): TaskLogHandle => {
  const logMsg = (message: string): Effect.Effect<void> =>
    mode === "stream-json"
      ? emitEvent({ type: "log", level: "info", message })
      : Effect.sync(() => console.error(message));

  return {
    message: (msg) => logMsg(`[${title}] ${msg}`),
    group: (name) => Effect.succeed(makeStructuredTaskLogGroupHandle(mode, name)),
    error: (message) =>
      mode === "stream-json"
        ? emitEvent({ type: "log", level: "error", message: `[${title}] ${message}` })
        : Effect.sync(() => console.error(`[${title}] ${message}`)),
    success: (message) => logMsg(`[${title}] ${message}`),
  };
};

const makeStructuredActivityService = (
  mode: StructuredMode,
): ServiceMap.Service.Shape<typeof Activity> => {
  const structuredWithSpinner = <A, E, R>(
    message: string,
    f: (handle: SpinnerHandle) => Effect.Effect<A, E, R>,
    options?: string | SpinnerOptions<A>,
  ): Effect.Effect<A, E, R> => {
    if (mode !== "stream-json") {
      return f(noopSpinnerHandle);
    }

    const handle = makeStreamSpinnerHandle("work");
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
  };

  return {
    startSpinner: (message) => {
      if (mode === "stream-json" && message) {
        return emitEvent({ type: "progress", phase: "start", percent: 0, message }).pipe(
          Effect.as(makeStreamSpinnerHandle("start")),
        );
      }
      return Effect.succeed(noopSpinnerHandle);
    },

    withSpinner: structuredWithSpinner,

    startProgress: (config, message) => {
      if (mode === "stream-json" && message) {
        const max = config.max ?? 100;
        return emitEvent({ type: "progress", phase: "progress", percent: 0, message }).pipe(
          Effect.as(makeStreamProgressHandle("progress", max)),
        );
      }
      return Effect.succeed(noopProgressHandle);
    },

    withProgress: (config, message, f, stopMessage) => {
      if (mode !== "stream-json") {
        return f(noopProgressHandle);
      }

      const max = config.max ?? 100;
      const handle = makeStreamProgressHandle("progress", max);
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

    startTaskLog: (config) => Effect.succeed(makeStructuredTaskLogHandle(mode, config.title)),

    withTaskLog: (config, f) => {
      const handle = makeStructuredTaskLogHandle(mode, config.title);
      return f(handle);
    },

    runTasks: (tasks) =>
      Effect.forEach(
        tasks.filter((t) => t.enabled !== false),
        (task) =>
          structuredWithSpinner(task.title, (handle) =>
            Effect.map(
              task.task((msg) => handle.message(msg)),
              (result) => result ?? task.title,
            ),
          ),
        { concurrency: 1 },
      ),
  };
};

export const ActivityStructured = (mode: StructuredMode): Layer.Layer<Activity> =>
  Layer.succeed(Activity, makeStructuredActivityService(mode));
