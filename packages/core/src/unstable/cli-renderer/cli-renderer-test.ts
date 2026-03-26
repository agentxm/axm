import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import {
  CliRenderer,
  type BoxOptions,
  type ColumnDef,
  type LogMessage,
  type ProgressConfig,
  type ProgressHandle,
  type SpinnerHandle,
  type SpinnerOptions,
  type TaskLogConfig,
  type TaskLogGroupHandle,
  type TaskLogHandle,
  type TreeDef,
  type TreeNode,
} from "./cli-renderer.js";

// ---------------------------------------------------------------------------
// TestRendererState — mutable state object capturing all CliRenderer calls
// ---------------------------------------------------------------------------

export interface TestRendererState {
  readonly logs: Array<LogMessage>;
  readonly tables: Array<{
    items: ReadonlyArray<unknown>;
    columns: ReadonlyArray<unknown>;
    caption?: string;
  }>;
  readonly details: Array<{
    item: unknown;
    columns: ReadonlyArray<unknown>;
    title?: string;
  }>;
  readonly trees: Array<{
    roots: ReadonlyArray<unknown>;
    def: unknown;
    title?: string;
  }>;
  readonly results: Array<{ data: unknown; schema: Option.Option<unknown> }>;
  readonly spinnerMessages: Array<string>;
  readonly notes: Array<{ message: string; title?: string }>;
  readonly boxes: Array<{ message: string; title?: string; opts?: BoxOptions }>;
  readonly cancelMessages: Array<string>;
  introTitle: Option.Option<string>;
  outroMessage: Option.Option<string>;
}

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

const makeEmptyState = (): TestRendererState => ({
  logs: [],
  tables: [],
  details: [],
  trees: [],
  results: [],
  spinnerMessages: [],
  notes: [],
  boxes: [],
  cancelMessages: [],
  introTitle: Option.none(),
  outroMessage: Option.none(),
});

const makeMockSpinnerHandle = (state: TestRendererState, _message: string): SpinnerHandle => ({
  stop: (msg) =>
    Effect.sync(() => {
      if (msg) state.spinnerMessages.push(msg);
    }),
  update: (msg) =>
    Effect.sync(() => {
      if (msg) state.spinnerMessages.push(msg);
    }),
  cancel: (msg) =>
    Effect.sync(() => {
      if (msg) state.cancelMessages.push(msg);
    }),
  error: (msg) =>
    Effect.sync(() => {
      if (msg) state.logs.push({ _tag: "error", message: msg });
    }),
  clear: () => Effect.void,
});

const makeMockProgressHandle = (state: TestRendererState, message: string): ProgressHandle => ({
  ...makeMockSpinnerHandle(state, message),
  advance: () => Effect.void,
});

const makeTestRendererService = (
  state: TestRendererState,
  resultReturnValue: boolean,
): typeof CliRenderer.Service => {
  const mockWithSpinner = <A, E, R>(
    message: string,
    f: (handle: SpinnerHandle) => Effect.Effect<A, E, R>,
    options?: SpinnerOptions<A>,
  ): Effect.Effect<A, E, R> =>
    Effect.suspend(() => {
      state.spinnerMessages.push(message);
      const handle = makeMockSpinnerHandle(state, message);
      const successMessage =
        typeof options?.successMessage === "string" ? options.successMessage : undefined;
      const successMessageFn =
        typeof options?.successMessage === "function" ? options.successMessage : undefined;
      const failureMessage = options?.failureMessage;

      return Effect.interruptible(f(handle)).pipe(
        Effect.matchCauseEffect({
          onFailure: (cause) => {
            if (Cause.hasInterruptsOnly(cause)) {
              state.cancelMessages.push("Cancelled");
            } else {
              const errorMsg = failureMessage ?? "Failed";
              state.spinnerMessages.push(errorMsg);
              state.logs.push({
                _tag: "error",
                message: failureMessage ?? message,
              });
            }
            return Effect.failCause(cause);
          },
          onSuccess: (a) => {
            const resolvedMsg = successMessageFn?.(a) ?? successMessage;
            if (resolvedMsg) state.spinnerMessages.push(resolvedMsg);
            return Effect.succeed(a);
          },
        }),
        Effect.uninterruptible,
      );
    });

  const service: typeof CliRenderer.Service = {
    // Chrome (stderr)
    intro: (title: string) =>
      Effect.sync(() => {
        state.introTitle = Option.some(title);
      }),
    outro: (message: string) =>
      Effect.sync(() => {
        state.outroMessage = Option.some(message);
      }),
    message: (message: string) =>
      Effect.sync(() => {
        state.logs.push({ _tag: "message", message });
      }),
    info: (message: string) =>
      Effect.sync(() => {
        state.logs.push({ _tag: "info", message });
      }),
    success: (message: string) =>
      Effect.sync(() => {
        state.logs.push({ _tag: "success", message });
      }),
    step: (message: string) =>
      Effect.sync(() => {
        state.logs.push({ _tag: "step", message });
      }),
    warn: (message: string) =>
      Effect.sync(() => {
        state.logs.push({ _tag: "warn", message });
      }),
    error: (message: string) =>
      Effect.sync(() => {
        state.logs.push({ _tag: "error", message });
      }),
    cancel: (message?: string) =>
      Effect.sync(() => {
        if (message) state.cancelMessages.push(message);
      }),
    note: (message: string, title?: string) =>
      Effect.sync(() => {
        state.notes.push({ message, ...(title !== undefined && { title }) });
      }),
    box: (message: string, title?: string, opts?: BoxOptions) =>
      Effect.sync(() => {
        state.boxes.push({
          message,
          ...(title !== undefined && { title }),
          ...(opts !== undefined && { opts }),
        });
      }),
    streamLog: <E, R>(
      _level: "message" | "info" | "success" | "step" | "warn" | "error",
      stream: Stream.Stream<string, E, R>,
    ) =>
      Stream.runCollect(stream).pipe(
        Effect.tap((chunks) =>
          Effect.sync(() => {
            const text = Array.from(chunks).join("");
            state.logs.push({ _tag: _level, message: text });
          }),
        ),
        Effect.asVoid,
      ),

    // Activity
    spinner: (message: string) =>
      Effect.sync(() => {
        state.spinnerMessages.push(message);
        return makeMockSpinnerHandle(state, message);
      }),
    withSpinner: mockWithSpinner,
    progress: (config: ProgressConfig, message?: string) =>
      Effect.sync(() => {
        if (message) state.spinnerMessages.push(message);
        return makeMockProgressHandle(state, message ?? "");
      }),
    withProgress: <A, E, R>(
      _config: ProgressConfig,
      message: string,
      f: (handle: ProgressHandle) => Effect.Effect<A, E, R>,
      stopMessage?: string,
    ): Effect.Effect<A, E, R> =>
      Effect.suspend(() => {
        state.spinnerMessages.push(message);
        const handle = makeMockProgressHandle(state, message);

        return Effect.interruptible(f(handle)).pipe(
          Effect.matchCauseEffect({
            onFailure: (cause) => {
              if (Cause.hasInterruptsOnly(cause)) {
                state.cancelMessages.push("Cancelled");
              } else {
                state.spinnerMessages.push("Failed");
                state.logs.push({ _tag: "error", message });
              }
              return Effect.failCause(cause);
            },
            onSuccess: (a) => {
              if (stopMessage) state.spinnerMessages.push(stopMessage);
              return Effect.succeed(a);
            },
          }),
          Effect.uninterruptible,
        );
      }),
    taskLog: (config: TaskLogConfig) =>
      Effect.sync((): TaskLogHandle => {
        state.spinnerMessages.push(config.title);
        return {
          message: (msg: string) =>
            Effect.sync(() => {
              state.logs.push({ _tag: "info", message: `[${config.title}] ${msg}` });
            }),
          group: (name: string) =>
            Effect.succeed({
              message: (msg: string) =>
                Effect.sync(() => {
                  state.logs.push({ _tag: "info", message: `[${name}] ${msg}` });
                }),
              error: (msg: string) =>
                Effect.sync(() => {
                  state.logs.push({ _tag: "error", message: `[${name}] ${msg}` });
                }),
              success: (msg: string) =>
                Effect.sync(() => {
                  state.logs.push({ _tag: "success", message: `[${name}] ${msg}` });
                }),
            } satisfies TaskLogGroupHandle),
          error: (msg: string) =>
            Effect.sync(() => {
              state.logs.push({ _tag: "error", message: `[${config.title}] ${msg}` });
            }),
          success: (msg: string) =>
            Effect.sync(() => {
              state.logs.push({ _tag: "success", message: `[${config.title}] ${msg}` });
            }),
        };
      }),
    withTaskLog: <A, E, R>(
      config: TaskLogConfig,
      f: (handle: TaskLogHandle) => Effect.Effect<A, E, R>,
    ): Effect.Effect<A, E, R> =>
      Effect.suspend(() => {
        state.spinnerMessages.push(config.title);
        const handle: TaskLogHandle = {
          message: (msg: string) =>
            Effect.sync(() => {
              state.logs.push({ _tag: "info", message: `[${config.title}] ${msg}` });
            }),
          group: (name: string) =>
            Effect.succeed({
              message: (msg: string) =>
                Effect.sync(() => {
                  state.logs.push({ _tag: "info", message: `[${name}] ${msg}` });
                }),
              error: (msg: string) =>
                Effect.sync(() => {
                  state.logs.push({ _tag: "error", message: `[${name}] ${msg}` });
                }),
              success: (msg: string) =>
                Effect.sync(() => {
                  state.logs.push({ _tag: "success", message: `[${name}] ${msg}` });
                }),
            } satisfies TaskLogGroupHandle),
          error: (msg: string) =>
            Effect.sync(() => {
              state.logs.push({ _tag: "error", message: `[${config.title}] ${msg}` });
            }),
          success: (msg: string) =>
            Effect.sync(() => {
              state.logs.push({ _tag: "success", message: `[${config.title}] ${msg}` });
            }),
        };
        return f(handle);
      }),
    runTasks: <E, R>(
      tasks: ReadonlyArray<{
        readonly title: string;
        readonly task: (
          message: (msg: string) => Effect.Effect<void>,
        ) => Effect.Effect<string | void, E, R>;
        readonly enabled?: boolean;
      }>,
    ) =>
      Effect.forEach(
        tasks.filter((t) => t.enabled !== false),
        (task) =>
          mockWithSpinner(task.title, (handle) =>
            Effect.map(
              task.task((msg) => handle.update(msg)),
              (result) => result ?? task.title,
            ),
          ),
        { concurrency: 1 },
      ).pipe(Effect.asVoid),

    // Data display (stdout)
    table: <T>(items: ReadonlyArray<T>, columns: ReadonlyArray<ColumnDef<T>>, caption?: string) =>
      Effect.sync(() => {
        state.tables.push({
          items: Array.from(items),
          columns: Array.from(columns),
          ...(caption !== undefined && { caption }),
        });
      }),
    detail: <T>(item: T, columns: ReadonlyArray<ColumnDef<T>>, title?: string) =>
      Effect.sync(() => {
        state.details.push({
          item,
          columns: Array.from(columns),
          ...(title !== undefined && { title }),
        });
      }),
    tree: <T>(roots: ReadonlyArray<TreeNode<T>>, def: TreeDef<T>, title?: string) =>
      Effect.sync(() => {
        state.trees.push({
          roots: Array.from(roots),
          def,
          ...(title !== undefined && { title }),
        });
      }),

    // Machine data output (stdout)
    result: <T>(data: T, schema: Schema.Schema<T>) =>
      Effect.sync(() => {
        state.results.push({
          data,
          schema: Option.some(schema),
        });
        return resultReturnValue;
      }),
    resultStream: <T>(stream: Stream.Stream<T>, schema: Schema.Schema<T>) =>
      Stream.runCollect(stream).pipe(
        Effect.tap((chunks) =>
          Effect.sync(() => {
            for (const item of chunks) {
              state.results.push({
                data: item,
                schema: Option.some(schema),
              });
            }
          }),
        ),
        Effect.as(resultReturnValue),
      ),

    // Both modes (stdout)
    json: (data: unknown) =>
      Effect.sync(() => {
        state.results.push({
          data,
          schema: Option.none(),
        });
      }),
    raw: (content: string) =>
      Effect.sync(() => {
        state.logs.push({ _tag: "message", message: content });
      }),
  };

  return service;
};

// ---------------------------------------------------------------------------
// logsByTag — convenience getter object for filtering logs by tag
// ---------------------------------------------------------------------------

export const logsByTag = (state: TestRendererState) => ({
  get message() {
    return state.logs.filter((l) => l._tag === "message").map((l) => l.message);
  },
  get info() {
    return state.logs.filter((l) => l._tag === "info").map((l) => l.message);
  },
  get warn() {
    return state.logs.filter((l) => l._tag === "warn").map((l) => l.message);
  },
  get error() {
    return state.logs.filter((l) => l._tag === "error").map((l) => l.message);
  },
  get success() {
    return state.logs.filter((l) => l._tag === "success").map((l) => l.message);
  },
  get step() {
    return state.logs.filter((l) => l._tag === "step").map((l) => l.message);
  },
});

// ---------------------------------------------------------------------------
// TestRenderer — result() returns false (simulates interactive mode)
// ---------------------------------------------------------------------------

export const TestRenderer = {
  make: (): { readonly layer: Layer.Layer<CliRenderer>; readonly state: TestRendererState } => {
    const state = makeEmptyState();
    const service = makeTestRendererService(state, false);
    const layer = Layer.succeed(CliRenderer, service);
    return { layer, state };
  },
};

// ---------------------------------------------------------------------------
// TestMachineRenderer — result() returns true (simulates machine mode)
// ---------------------------------------------------------------------------

export const TestMachineRenderer = {
  make: (): { readonly layer: Layer.Layer<CliRenderer>; readonly state: TestRendererState } => {
    const state = makeEmptyState();
    const service = makeTestRendererService(state, true);
    const layer = Layer.succeed(CliRenderer, service);
    return { layer, state };
  },
};
