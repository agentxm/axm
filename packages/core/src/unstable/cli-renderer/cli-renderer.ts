import type * as Effect from "effect/Effect";
import * as ServiceMap from "effect/Context";
import type * as Schema from "effect/Schema";
import type * as Stream from "effect/Stream";

import type { SuggestedAction } from "../cli-runtime/suggested-action.js";

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

export type ViewKey<T extends object> = Extract<keyof T, string>;

export type TableAlign = "left" | "right";

export type TableWidth = "auto" | "fill" | number;

export interface TableColumnConfig<T extends object, K extends ViewKey<T>> {
  readonly header: string;
  readonly render?: (value: T[K], row: T) => string;
  readonly align?: TableAlign;
  readonly width?: TableWidth;
}

export interface TableView<T extends object> {
  readonly columns: {
    readonly [K in ViewKey<T>]: TableColumnConfig<T, K>;
  };
}

export interface DetailFieldConfig<T extends object, K extends ViewKey<T>> {
  readonly label: string;
  readonly render?: (value: T[K], row: T) => string;
}

export interface DetailView<T extends object> {
  readonly fields: {
    readonly [K in ViewKey<T>]: DetailFieldConfig<T, K>;
  };
}

export interface ResolvedTableColumn<T extends object> {
  readonly key: ViewKey<T>;
  readonly header: string;
  readonly render: (row: T) => string;
  readonly align: TableAlign;
  readonly width: TableWidth;
}

export interface ResolvedDetailField<T extends object> {
  readonly key: ViewKey<T>;
  readonly label: string;
  readonly render: (row: T) => string;
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

export interface ListPayload<T extends object> extends SuccessOptions {
  readonly items: ReadonlyArray<T>;
  readonly count?: number;
  readonly emptyMessage?: string;
}

export interface DetailOptions extends SuggestionOptions {
  readonly title?: string;
}

export interface TreePayload<T extends object> extends SuccessOptions {
  readonly roots: ReadonlyArray<TreeNode<T>>;
}

export interface BoxOptions {
  readonly contentAlignment?: "left" | "center" | "right";
  readonly titleAlignment?: "left" | "center" | "right";
  readonly width?: number;
  readonly padding?: number;
  readonly rounded?: boolean;
}

export interface SuggestionOptions {
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
  readonly withoutSuggestions?: boolean;
}

export interface SuccessOptions extends SuggestionOptions {
  readonly summary?: string;
}

export interface ResultOptions extends SuccessOptions {
  readonly ok?: boolean;
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
    /**
     * Authentication or other interactive instructions required to complete
     * the current operation. These remain visible in quiet and machine modes.
     */
    readonly instruction: (message: string) => Effect.Effect<void>;
    /** Raw human-facing diagnostic content written to stderr. */
    readonly diagnostic: (content: string) => Effect.Effect<void>;
    /** Human-facing table written to stderr without machine-output framing. */
    readonly diagnosticTable: <T extends object>(
      items: ReadonlyArray<T>,
      view: TableView<T>,
      caption?: string,
    ) => Effect.Effect<void>;
    readonly info: (message: string) => Effect.Effect<void>;
    readonly success: (message: string, options?: SuccessOptions) => Effect.Effect<void>;
    readonly step: (message: string) => Effect.Effect<void>;
    readonly warn: (message: string) => Effect.Effect<void>;
    readonly error: (message: string, options?: SuggestionOptions) => Effect.Effect<void>;
    readonly suggestions: (
      suggestions: ReadonlyArray<SuggestedAction>,
      options?: SuggestionOptions,
    ) => Effect.Effect<void>;
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
    readonly table: <T extends object>(
      items: ReadonlyArray<T>,
      view: TableView<T>,
      caption?: string,
    ) => Effect.Effect<void>;
    readonly list: <T extends object>(
      entity: string,
      payload: ListPayload<T>,
    ) => Effect.Effect<boolean>;
    readonly detail: {
      <T extends object>(item: T, view: DetailView<T>, title?: string): Effect.Effect<void>;
      <T extends object>(entity: string, item: T, options?: DetailOptions): Effect.Effect<boolean>;
    };
    readonly tree: {
      <T>(roots: ReadonlyArray<TreeNode<T>>, def: TreeDef<T>, title?: string): Effect.Effect<void>;
      <T extends object>(entity: string, payload: TreePayload<T>): Effect.Effect<boolean>;
    };

    // Machine data output (stdout)
    readonly result: <S extends Schema.Top>(
      data: Schema.Schema.Type<S>,
      schema: S,
      options?: ResultOptions,
    ) => Effect.Effect<boolean, never, S["EncodingServices"]>;

    // Both modes (stdout)
    readonly json: (data: unknown) => Effect.Effect<void>;
    readonly raw: (content: string) => Effect.Effect<void>;
    readonly markdown: (content: string) => Effect.Effect<void>;
  }
>()("@agentxm/client-core/unstable/cli-renderer/cli-renderer/CliRenderer") {}
