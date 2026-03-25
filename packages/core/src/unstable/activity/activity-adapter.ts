import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliRenderer, type SpinnerHandle as RendererSpinnerHandle } from "../cli-renderer/cli-renderer.js";
import { Activity, type SpinnerHandle, type ProgressHandle } from "./activity.js";

/**
 * Adapt a CliRenderer SpinnerHandle (which has `update`) to an Activity
 * SpinnerHandle (which has `message`).
 */
const adaptSpinnerHandle = (handle: RendererSpinnerHandle): SpinnerHandle => ({
  stop: (msg) => handle.stop(msg),
  message: (msg) => handle.update(msg),
  cancel: (msg) => handle.cancel(msg),
  error: (msg) => handle.error(msg),
  clear: () => handle.clear(),
});

/**
 * Adapt a CliRenderer ProgressHandle to an Activity ProgressHandle.
 * ProgressHandle extends SpinnerHandle, so we adapt the base and add `advance`.
 */
const adaptProgressHandle = (handle: {
  readonly stop: (message?: string) => Effect.Effect<void>;
  readonly update: (message?: string) => Effect.Effect<void>;
  readonly cancel: (message?: string) => Effect.Effect<void>;
  readonly error: (message?: string) => Effect.Effect<void>;
  readonly clear: () => Effect.Effect<void>;
  readonly advance: (step?: number, message?: string) => Effect.Effect<void>;
}): ProgressHandle => ({
  stop: (msg) => handle.stop(msg),
  message: (msg) => handle.update(msg),
  cancel: (msg) => handle.cancel(msg),
  error: (msg) => handle.error(msg),
  clear: () => handle.clear(),
  advance: (step, msg) => handle.advance(step, msg),
});

/**
 * Adapter layer that implements `Activity` by delegating to `CliRenderer`.
 *
 * This is a temporary bridge during migration — once all handlers use
 * CliRenderer directly, this adapter and the Activity service will be removed.
 */
export const ActivityAdapter: Layer.Layer<Activity, never, CliRenderer> = Layer.effect(
  Activity,
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    return {
      startSpinner: (msg) =>
        Effect.map(renderer.spinner(msg ?? ""), adaptSpinnerHandle),

      withSpinner: (msg, f, opts) =>
        renderer.withSpinner(
          msg,
          (handle) => f(adaptSpinnerHandle(handle)),
          typeof opts === "string" ? { successMessage: opts } : opts,
        ),

      startProgress: (config, msg) =>
        Effect.map(renderer.progress(config, msg), adaptProgressHandle),

      withProgress: (config, msg, f, stopMsg) =>
        renderer.withProgress(config, msg, (handle) => f(adaptProgressHandle(handle)), stopMsg),

      startTaskLog: (config) => renderer.taskLog(config),

      withTaskLog: (config, f) => renderer.withTaskLog(config, f),

      runTasks: (tasks) => renderer.runTasks(tasks),
    };
  }),
);
