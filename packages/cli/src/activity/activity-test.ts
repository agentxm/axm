import * as Cause from "effect/Cause";
import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import {
  Activity,
  type SpinnerHandle,
  type SpinnerOptions,
  type ProgressHandle,
  type ProgressConfig,
  type TaskLogConfig,
  type TaskLogGroupHandle,
  type TaskLogHandle,
} from "./activity.js";

export interface ActivityCall {
  readonly method: string;
  readonly args: ReadonlyArray<unknown>;
}

export interface ActivityGroupRecord {
  readonly name: string;
  readonly calls: ReadonlyArray<ActivityCall>;
}

export interface ActivityRecord {
  readonly calls: ReadonlyArray<ActivityCall>;
  readonly starts: ReadonlyArray<string>;
  readonly stops: ReadonlyArray<string>;
  readonly groups: ReadonlyArray<ActivityGroupRecord>;
}

export type MockActivityService = {
  calls: Array<ActivityCall>;
  starts: Array<string>;
  stops: Array<string>;
};

const emptyRecord: ActivityRecord = {
  calls: [],
  starts: [],
  stops: [],
  groups: [],
};

export class ActivityTest extends ServiceMap.Service<
  ActivityTest,
  {
    readonly ref: Ref.Ref<ActivityRecord>;
    readonly get: Effect.Effect<ActivityRecord>;
  }
>()("@axm.sh/cli/test/ActivityTest") {}

const makeMockSpinnerHandle = (
  recordCall: (method: string, args: ReadonlyArray<unknown>) => Effect.Effect<void>,
): SpinnerHandle => ({
  stop: (message) => recordCall("handle.stop", [message]),
  message: (message) => recordCall("handle.message", [message]),
  cancel: (message) => recordCall("handle.cancel", [message]),
  error: (message) => recordCall("handle.error", [message]),
  clear: () => recordCall("handle.clear", []),
});

const makeMockProgressHandle = (
  recordCall: (method: string, args: ReadonlyArray<unknown>) => Effect.Effect<void>,
): ProgressHandle => ({
  stop: (message) => recordCall("handle.stop", [message]),
  message: (message) => recordCall("handle.message", [message]),
  cancel: (message) => recordCall("handle.cancel", [message]),
  error: (message) => recordCall("handle.error", [message]),
  clear: () => recordCall("handle.clear", []),
  advance: (step, message) => recordCall("handle.advance", [step, message]),
});

export const makeActivityTestLayer = (): readonly [
  Layer.Layer<Activity | ActivityTest>,
  MockActivityService,
] => {
  const mock: MockActivityService = {
    calls: [],
    starts: [],
    stops: [],
  };

  const layer: Layer.Layer<Activity | ActivityTest> = Layer.effectServices(
    Effect.gen(function* () {
      const ref = yield* Ref.make(emptyRecord);

      const recordCall = (method: string, args: ReadonlyArray<unknown>) =>
        Effect.sync(() => {
          mock.calls.push({ method, args });
        }).pipe(
          Effect.andThen(
            Ref.update(ref, (r) => ({
              ...r,
              calls: [...r.calls, { method, args }],
            })),
          ),
        );

      const recordStart = (method: string, args: ReadonlyArray<unknown>, message: string) =>
        Effect.sync(() => {
          mock.calls.push({ method, args });
          mock.starts.push(message);
        }).pipe(
          Effect.andThen(
            Ref.update(ref, (r) => ({
              ...r,
              calls: [...r.calls, { method, args }],
              starts: [...r.starts, message],
            })),
          ),
        );

      const recordStop = (method: string, args: ReadonlyArray<unknown>, message: string) =>
        Effect.sync(() => {
          mock.calls.push({ method, args });
          mock.stops.push(message);
        }).pipe(
          Effect.andThen(
            Ref.update(ref, (r) => ({
              ...r,
              calls: [...r.calls, { method, args }],
              stops: [...r.stops, message],
            })),
          ),
        );

      const mockWithSpinner = <A, E, R>(
        message: string,
        f: (handle: SpinnerHandle) => Effect.Effect<A, E, R>,
        options?: string | SpinnerOptions<A>,
      ): Effect.Effect<A, E, R> =>
        Effect.suspend(() => {
          const handle = makeMockSpinnerHandle(recordCall);
          const staticStopMessage =
            typeof options === "string"
              ? options
              : typeof options?.successMessage === "string"
                ? options.successMessage
                : message;
          const successMessageFn =
            typeof options === "object" && typeof options.successMessage === "function"
              ? options.successMessage
              : undefined;
          const failureMessage = typeof options === "object" ? options.failureMessage : undefined;

          return recordStart("withSpinner.start", [message], message).pipe(
            Effect.andThen(Effect.interruptible(f(handle))),
            Effect.matchCauseEffect({
              onFailure: (cause) => {
                if (Cause.hasInterruptsOnly(cause)) {
                  return Effect.andThen(
                    recordStop("withSpinner.cancel", [], "Cancelled"),
                    Effect.failCause(cause),
                  );
                }
                return Effect.andThen(
                  recordStop("withSpinner.error", [message], failureMessage ?? "Failed"),
                  Effect.failCause(cause),
                );
              },
              onSuccess: (a) => {
                const resolvedStopMessage = successMessageFn?.(a) ?? staticStopMessage;
                return Effect.andThen(
                  recordStop("withSpinner.stop", [resolvedStopMessage], resolvedStopMessage),
                  Effect.succeed(a),
                );
              },
            }),
            Effect.uninterruptible,
          );
        });

      const makeTaskLogGroupHandle = (name: string): Effect.Effect<TaskLogGroupHandle> =>
        Effect.gen(function* () {
          yield* Ref.update(ref, (r) => ({
            ...r,
            groups: [...r.groups, { name, calls: [] }],
          }));

          const groupIndex = (yield* Ref.get(ref)).groups.length - 1;

          const appendGroupCall = (method: string, args: ReadonlyArray<unknown>) =>
            recordCall(`group.${method}`, args).pipe(
              Effect.andThen(
                Ref.update(ref, (r) => ({
                  ...r,
                  groups: r.groups.map((g, i) =>
                    i === groupIndex ? { ...g, calls: [...g.calls, { method, args }] } : g,
                  ),
                })),
              ),
            );

          return {
            message: (msg: string) => appendGroupCall("message", [msg]),
            error: (message: string) => appendGroupCall("error", [message]),
            success: (message: string) => appendGroupCall("success", [message]),
          };
        });

      const service: ServiceMap.Service.Shape<typeof Activity> = {
        startSpinner: (message) =>
          Effect.andThen(
            recordStart("startSpinner", [message], message ?? ""),
            Effect.succeed(makeMockSpinnerHandle(recordCall)),
          ),

        withSpinner: mockWithSpinner,

        startProgress: (config, message) =>
          Effect.andThen(
            recordStart("startProgress", [config, message], message ?? ""),
            Effect.succeed(makeMockProgressHandle(recordCall)),
          ),

        withProgress: <A, E, R>(
          config: ProgressConfig,
          message: string,
          f: (handle: ProgressHandle) => Effect.Effect<A, E, R>,
          stopMessage?: string,
        ): Effect.Effect<A, E, R> =>
          Effect.suspend(() => {
            const handle = makeMockProgressHandle(recordCall);

            return recordStart("withProgress.start", [config, message], message).pipe(
              Effect.andThen(Effect.interruptible(f(handle))),
              Effect.matchCauseEffect({
                onFailure: (cause) => {
                  if (Cause.hasInterruptsOnly(cause)) {
                    return Effect.andThen(
                      recordStop("withProgress.cancel", [], "Cancelled"),
                      Effect.failCause(cause),
                    );
                  }
                  return Effect.andThen(
                    recordStop("withProgress.error", [message], "Failed"),
                    Effect.failCause(cause),
                  );
                },
                onSuccess: (a) =>
                  Effect.andThen(
                    recordStop(
                      "withProgress.stop",
                      [stopMessage ?? message],
                      stopMessage ?? message,
                    ),
                    Effect.succeed(a),
                  ),
              }),
              Effect.uninterruptible,
            );
          }),

        startTaskLog: (config) =>
          recordCall("startTaskLog", [config]).pipe(
            Effect.map(() => ({
              message: (msg: string) => recordCall("taskLog.message", [msg]),
              group: (name: string) =>
                recordCall("taskLog.group", [name]).pipe(
                  Effect.flatMap(() => makeTaskLogGroupHandle(name)),
                ),
              error: (message: string) => recordCall("taskLog.error", [message]),
              success: (message: string) => recordCall("taskLog.success", [message]),
            })),
          ),

        withTaskLog: <A, E, R>(
          config: TaskLogConfig,
          f: (handle: TaskLogHandle) => Effect.Effect<A, E, R>,
        ): Effect.Effect<A, E, R> =>
          Effect.suspend(() => {
            const handle: TaskLogHandle = {
              message: (msg: string) => recordCall("taskLog.message", [msg]),
              group: (name: string) =>
                recordCall("taskLog.group", [name]).pipe(
                  Effect.flatMap(() => makeTaskLogGroupHandle(name)),
                ),
              error: (message: string) => recordCall("taskLog.error", [message]),
              success: (message: string) => recordCall("taskLog.success", [message]),
            };
            return recordCall("withTaskLog", [config]).pipe(Effect.andThen(f(handle)));
          }),

        runTasks: (tasks) =>
          Effect.forEach(
            tasks.filter((t) => t.enabled !== false),
            (task) =>
              mockWithSpinner(task.title, (handle) =>
                Effect.map(
                  task.task((msg) => handle.message(msg)),
                  (result) => result ?? task.title,
                ),
              ),
            { concurrency: 1 },
          ),
      };

      const test: ServiceMap.Service.Shape<typeof ActivityTest> = {
        ref,
        get: Ref.get(ref),
      };

      return ServiceMap.empty().pipe(
        ServiceMap.add(Activity, service),
        ServiceMap.add(ActivityTest, test),
      );
    }),
  );

  return [layer, mock] as const;
};

export const [ActivityTestLayer] = makeActivityTestLayer();
