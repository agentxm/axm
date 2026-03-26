import type * as Effect from "effect/Effect";
import * as ServiceMap from "effect/ServiceMap";
import type * as Schema from "effect/Schema";
import type * as Stream from "effect/Stream";

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

export type LogLevel = "message" | "info" | "success" | "step" | "warn" | "error";

export type LogMessage =
  | { readonly _tag: "message"; readonly message: string }
  | { readonly _tag: "info"; readonly message: string }
  | { readonly _tag: "success"; readonly message: string }
  | { readonly _tag: "step"; readonly message: string }
  | { readonly _tag: "warn"; readonly message: string }
  | { readonly _tag: "error"; readonly message: string };

export interface SpinnerHandle {
  readonly stop: (message?: string) => Effect.Effect<void>;
  readonly update: (message?: string) => Effect.Effect<void>;
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

export interface ColumnDef<T> {
  readonly key: string;
  readonly header: string;
  readonly value: (item: T) => string;
  readonly priority: number;
  readonly align: "left" | "right";
  readonly width: "auto" | "fill" | number;
}

export interface TreeNode<T> {
  readonly data: T;
  readonly children?: ReadonlyArray<TreeNode<T>>;
}

export interface TreeDef<T> {
  readonly label: (item: T) => string;
  readonly detail?: (item: T) => string | undefined;
  readonly icon?: (item: T) => string | undefined;
}

export interface BoxOptions {
  readonly contentAlignment?: "left" | "center" | "right";
  readonly titleAlignment?: "left" | "center" | "right";
  readonly width?: number;
  readonly padding?: number;
  readonly rounded?: boolean;
}

// ---------------------------------------------------------------------------
// CliRenderer service
// ---------------------------------------------------------------------------

export class CliRenderer extends ServiceMap.Service<
  CliRenderer,
  {
    // Chrome (stderr)
    readonly intro: (title: string) => Effect.Effect<void>;
    readonly outro: (message: string) => Effect.Effect<void>;
    readonly message: (message: string) => Effect.Effect<void>;
    readonly info: (message: string) => Effect.Effect<void>;
    readonly success: (message: string) => Effect.Effect<void>;
    readonly step: (message: string) => Effect.Effect<void>;
    readonly warn: (message: string) => Effect.Effect<void>;
    readonly error: (message: string) => Effect.Effect<void>;
    readonly cancel: (message?: string) => Effect.Effect<void>;
    readonly note: (message: string, title?: string) => Effect.Effect<void>;
    readonly box: (message: string, title?: string, opts?: BoxOptions) => Effect.Effect<void>;
    readonly streamLog: <E, R>(
      level: LogLevel,
      stream: Stream.Stream<string, E, R>,
    ) => Effect.Effect<void, E, R>;
    readonly spinner: (message: string) => Effect.Effect<SpinnerHandle>;
    readonly withSpinner: <A, E, R>(
      message: string,
      f: (handle: SpinnerHandle) => Effect.Effect<A, E, R>,
      options?: SpinnerOptions<A>,
    ) => Effect.Effect<A, E, R>;
    readonly progress: (config: ProgressConfig, message?: string) => Effect.Effect<ProgressHandle>;
    readonly withProgress: <A, E, R>(
      config: ProgressConfig,
      message: string,
      f: (handle: ProgressHandle) => Effect.Effect<A, E, R>,
      stopMessage?: string,
    ) => Effect.Effect<A, E, R>;
    readonly taskLog: (config: TaskLogConfig) => Effect.Effect<TaskLogHandle>;
    readonly withTaskLog: <A, E, R>(
      config: TaskLogConfig,
      f: (handle: TaskLogHandle) => Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E, R>;
    readonly runTasks: <E, R>(tasks: ReadonlyArray<Task<E, R>>) => Effect.Effect<void, E, R>;

    // Data display (stdout)
    readonly table: <T>(
      items: ReadonlyArray<T>,
      columns: ReadonlyArray<ColumnDef<T>>,
      caption?: string,
    ) => Effect.Effect<void>;
    readonly detail: <T>(
      item: T,
      columns: ReadonlyArray<ColumnDef<T>>,
      title?: string,
    ) => Effect.Effect<void>;
    readonly tree: <T>(
      roots: ReadonlyArray<TreeNode<T>>,
      def: TreeDef<T>,
      title?: string,
    ) => Effect.Effect<void>;

    // Machine data output (stdout)
    readonly result: <T>(data: T, schema: Schema.Schema<T>) => Effect.Effect<boolean>;
    readonly resultStream: <T>(
      stream: Stream.Stream<T>,
      schema: Schema.Schema<T>,
    ) => Effect.Effect<boolean>;

    // Both modes (stdout)
    readonly json: (data: unknown) => Effect.Effect<void>;
    readonly raw: (content: string) => Effect.Effect<void>;
  }
>()("@axm.sh/cli/CliRenderer") {}
