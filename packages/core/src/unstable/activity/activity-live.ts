import * as p from "@clack/prompts";
import * as Cause from "effect/Cause";
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

const makeSpinnerHandle = (s: p.SpinnerResult): SpinnerHandle => ({
  stop: (message) => Effect.sync(() => s.stop(message)),
  message: (message) => Effect.sync(() => s.message(message)),
  cancel: (message) => Effect.sync(() => s.cancel(message)),
  error: (message) => Effect.sync(() => s.error(message)),
  clear: () => Effect.sync(() => s.clear()),
});

const makeProgressHandle = (pr: p.ProgressResult): ProgressHandle => ({
  stop: (message) => Effect.sync(() => pr.stop(message)),
  message: (message) => Effect.sync(() => pr.message(message)),
  cancel: (message) => Effect.sync(() => pr.cancel(message)),
  error: (message) => Effect.sync(() => pr.error(message)),
  clear: () => Effect.sync(() => pr.clear()),
  advance: (step, message) => Effect.sync(() => pr.advance(step, message)),
});

const wrapGroupHandle = (
  group: ReturnType<ReturnType<typeof p.taskLog>["group"]>,
): TaskLogGroupHandle => ({
  message: (msg) => Effect.sync(() => group.message(msg)),
  error: (message) => Effect.sync(() => group.error(message)),
  success: (message) => Effect.sync(() => group.success(message)),
});

const wrapTaskLogHandle = (handle: ReturnType<typeof p.taskLog>): TaskLogHandle => ({
  message: (msg) => Effect.sync(() => handle.message(msg)),
  group: (name) => Effect.sync(() => wrapGroupHandle(handle.group(name))),
  error: (message) => Effect.sync(() => handle.error(message)),
  success: (message) => Effect.sync(() => handle.success(message)),
});

const liveWithSpinner = <A, E, R>(
  message: string,
  f: (handle: SpinnerHandle) => Effect.Effect<A, E, R>,
  options?: string | SpinnerOptions<A>,
): Effect.Effect<A, E, R> =>
  Effect.suspend(() => {
    const s = p.spinner();
    s.start(message);
    const handle = makeSpinnerHandle(s);
    const successMessage =
      typeof options === "string"
        ? options
        : typeof options?.successMessage === "string"
          ? options.successMessage
          : undefined;
    const successMessageFn =
      typeof options === "object" && typeof options.successMessage === "function"
        ? options.successMessage
        : undefined;
    const failureMessage = typeof options === "object" ? options.failureMessage : undefined;

    return Effect.interruptible(f(handle)).pipe(
      Effect.matchCauseEffect({
        onFailure: (cause) => {
          if (Cause.hasInterruptsOnly(cause)) {
            s.cancel();
          } else {
            s.error(failureMessage ?? message);
          }
          return Effect.failCause(cause);
        },
        onSuccess: (a) => {
          s.stop(successMessageFn?.(a) ?? successMessage ?? message);
          return Effect.succeed(a);
        },
      }),
      Effect.uninterruptible,
    );
  });

export const ActivityLive: Layer.Layer<Activity> = Layer.succeed(Activity, {
  startSpinner: (message) =>
    Effect.sync(() => {
      const s = p.spinner();
      s.start(message);
      return makeSpinnerHandle(s);
    }),

  withSpinner: liveWithSpinner,

  startProgress: (config, message) =>
    Effect.sync(() => {
      const pr = p.progress(config);
      pr.start(message);
      return makeProgressHandle(pr);
    }),

  withProgress: (config, message, f, stopMessage) =>
    Effect.suspend(() => {
      const pr = p.progress(config);
      pr.start(message);
      const handle = makeProgressHandle(pr);

      return Effect.interruptible(f(handle)).pipe(
        Effect.matchCauseEffect({
          onFailure: (cause) => {
            if (Cause.hasInterruptsOnly(cause)) {
              pr.cancel();
            } else {
              pr.error(message);
            }
            return Effect.failCause(cause);
          },
          onSuccess: (a) => {
            pr.stop(stopMessage ?? message);
            return Effect.succeed(a);
          },
        }),
        Effect.uninterruptible,
      );
    }),

  startTaskLog: (config) => Effect.sync(() => wrapTaskLogHandle(p.taskLog(config))),

  withTaskLog: (config, f) =>
    Effect.suspend(() => {
      const handle = wrapTaskLogHandle(p.taskLog(config));
      return f(handle);
    }),

  runTasks: (tasks) =>
    Effect.forEach(
      tasks.filter((t) => t.enabled !== false),
      (task) =>
        liveWithSpinner(task.title, (handle) =>
          Effect.map(
            task.task((msg) => handle.message(msg)),
            (result) => result ?? task.title,
          ),
        ),
      { concurrency: 1 },
    ),
});
