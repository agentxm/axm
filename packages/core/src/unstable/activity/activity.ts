import * as ServiceMap from "effect/ServiceMap";
import type * as Effect from "effect/Effect";

export interface SpinnerHandle {
  readonly stop: (message?: string) => Effect.Effect<void>;
  readonly message: (message?: string) => Effect.Effect<void>;
  readonly cancel: (message?: string) => Effect.Effect<void>;
  readonly error: (message?: string) => Effect.Effect<void>;
  readonly clear: () => Effect.Effect<void>;
}

export interface SpinnerOptions<A> {
  readonly successMessage?: string | ((value: A) => string);
  readonly failureMessage?: string;
}

export interface ProgressConfig {
  readonly style?: "light" | "heavy" | "block";
  readonly max?: number;
  readonly size?: number;
}

export interface ProgressHandle extends SpinnerHandle {
  readonly advance: (step?: number, message?: string) => Effect.Effect<void>;
}

export interface TaskLogConfig {
  readonly title: string;
  readonly limit?: number;
  readonly retainLog?: boolean;
}

export interface TaskLogGroupHandle {
  readonly message: (msg: string) => Effect.Effect<void>;
  readonly error: (message: string) => Effect.Effect<void>;
  readonly success: (message: string) => Effect.Effect<void>;
}

export interface TaskLogHandle {
  readonly message: (msg: string) => Effect.Effect<void>;
  readonly group: (name: string) => Effect.Effect<TaskLogGroupHandle>;
  readonly error: (message: string) => Effect.Effect<void>;
  readonly success: (message: string) => Effect.Effect<void>;
}

export interface Task<E, R> {
  readonly title: string;
  readonly task: (
    message: (msg: string) => Effect.Effect<void>,
  ) => Effect.Effect<string | void, E, R>;
  readonly enabled?: boolean;
}

export class Activity extends ServiceMap.Service<
  Activity,
  {
    readonly startSpinner: (message?: string) => Effect.Effect<SpinnerHandle>;
    readonly withSpinner: <A, E, R>(
      message: string,
      f: (handle: SpinnerHandle) => Effect.Effect<A, E, R>,
      options?: string | SpinnerOptions<A>,
    ) => Effect.Effect<A, E, R>;
    readonly startProgress: (
      config: ProgressConfig,
      message?: string,
    ) => Effect.Effect<ProgressHandle>;
    readonly withProgress: <A, E, R>(
      config: ProgressConfig,
      message: string,
      f: (handle: ProgressHandle) => Effect.Effect<A, E, R>,
      stopMessage?: string,
    ) => Effect.Effect<A, E, R>;
    readonly startTaskLog: (config: TaskLogConfig) => Effect.Effect<TaskLogHandle>;
    readonly withTaskLog: <A, E, R>(
      config: TaskLogConfig,
      f: (handle: TaskLogHandle) => Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E, R>;
    readonly runTasks: <E, R>(tasks: ReadonlyArray<Task<E, R>>) => Effect.Effect<void, E, R>;
  }
>()("@axm.sh/cli/Activity") {}
