import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

import { resolveDetailFields, resolveTableColumns } from "./command-output.js";
import { count } from "./count.js";
import type { Doc, TreeItem } from "./doc.js";
import type {
  DetailOptions,
  DetailView,
  ListPayload,
  LogLevel,
  ProgressConfig,
  ProgressHandle,
  ScreenOutput,
  SpinnerHandle,
  SpinnerOptions,
  SuggestionOptions,
  TableView,
  TaskLogGroupHandle,
  TaskLogHandle,
  TreeDef,
  TreeNode,
  TreePayload,
} from "./output.js";
import { normalizeSuggestions, taskCompletionMessage } from "./presenter-helpers.js";
import { Screen, type TaskDetail } from "./screen.js";

const logDoc = (level: LogLevel, message: string): Doc => [
  level === "message"
    ? { _tag: "paragraph", text: message }
    : {
        _tag: "headline",
        tone:
          level === "success"
            ? "ok"
            : level === "warn"
              ? "warn"
              : level === "error"
                ? "error"
                : "info",
        text: message,
      },
];

const suggestionsDoc = (
  suggestions: ReadonlyArray<SuggestedAction> | undefined,
  options?: SuggestionOptions,
): Doc => {
  const visible = normalizeSuggestions(suggestions, options);
  return visible.length === 0 ? [] : [{ _tag: "next", actions: visible }];
};

const tableOutput = <T extends object>(
  items: ReadonlyArray<T>,
  view: TableView<T>,
  caption?: string,
): Doc => {
  const columns = resolveTableColumns(view);
  return columns.length === 0
    ? []
    : [
        {
          _tag: "table",
          columns: columns.map((column) => ({ header: column.header, align: column.align })),
          rows: items.map((item) => columns.map((column) => column.render(item))),
          ...(caption === undefined ? {} : { caption }),
        },
      ];
};

const genericTable = (items: ReadonlyArray<object>): Doc => {
  const keys = [...new Set(items.flatMap(Object.keys))];
  return keys.length === 0
    ? []
    : [
        {
          _tag: "table",
          columns: keys.map((header) => ({ header })),
          rows: items.map((item) =>
            keys.map((key) => {
              const value = Object.entries(item).find(([name]) => name === key)?.[1];
              return value == null ? "" : String(value);
            }),
          ),
        },
      ];
};

const treeItems = <T>(
  roots: ReadonlyArray<TreeNode<T>>,
  def: TreeDef<T>,
): ReadonlyArray<TreeItem> =>
  roots.map((node) => ({
    text: `${def.icon?.(node.data) ?? ""}${def.icon?.(node.data) === undefined ? "" : " "}${def.label(node.data)}`,
    ...(def.detail?.(node.data) === undefined ? {} : { detail: def.detail?.(node.data) ?? "" }),
    ...(node.children === undefined ? {} : { children: treeItems(node.children, def) }),
  }));

const progressDoc = (phase: string, percent: number, message: string, detail?: TaskDetail): Doc => [
  {
    _tag: "progress",
    phase,
    percent,
    message,
    ...(detail === undefined ? {} : { detail }),
  },
];

const spinner = (screen: typeof Screen.Service, label: string, phase = "start"): SpinnerHandle => ({
  stop: (message) => screen.note(progressDoc(phase, 100, message ?? label)),
  update: (message) =>
    message === undefined ? Effect.void : screen.note(progressDoc(phase, -1, message)),
  cancel: (message) =>
    message === undefined ? Effect.void : screen.note(progressDoc(phase, -1, message)),
  error: (message) => screen.note(progressDoc(phase, -1, message ?? "Error")),
  clear: () => Effect.void,
});

const taskLog = (screen: typeof Screen.Service, title: string): TaskLogHandle => {
  const group = (name: string): TaskLogGroupHandle => ({
    message: (message) => screen.note([{ _tag: "paragraph", text: `[${name}] ${message}` }]),
    error: (message) => screen.note(logDoc("error", `[${name}] ${message}`)),
    success: (message) => screen.note(logDoc("success", `[${name}] ${message}`)),
  });
  return {
    message: (message) => screen.note([{ _tag: "paragraph", text: `[${title}] ${message}` }]),
    group: (name) => Effect.succeed(group(name)),
    error: (message) => screen.note(logDoc("error", `[${title}] ${message}`)),
    success: (message) => screen.note(logDoc("success", `[${title}] ${message}`)),
  };
};

/** A plain semantic convenience value. Screen remains the sole output service and writer. */
export const makeScreenOutput = (screen: typeof Screen.Service): ScreenOutput => {
  const noteLog = (level: LogLevel, message: string) => screen.note(logDoc(level, message));
  const withSpinner = <A, E, R>(
    message: string,
    body: (handle: SpinnerHandle) => Effect.Effect<A, E, R>,
    options?: SpinnerOptions<A>,
  ) =>
    screen.task(
      message,
      (handle) =>
        body({
          stop: (next) => (next === undefined ? Effect.void : handle.update(next)),
          update: (next, detail) =>
            next === undefined ? Effect.void : handle.update(next, detail),
          cancel: (next) => (next === undefined ? Effect.void : handle.update(next)),
          error: (next) => (next === undefined ? Effect.void : handle.update(next)),
          clear: () => Effect.void,
        }),
      options,
    );

  function detail<T extends object>(
    item: T,
    view: DetailView<T>,
    title?: string,
  ): Effect.Effect<void>;
  function detail<T extends object>(
    entity: string,
    item: T,
    options?: DetailOptions,
  ): Effect.Effect<boolean>;
  function detail<T extends object>(
    first: string | T,
    second: T | DetailView<T>,
    third?: string | DetailOptions,
  ): Effect.Effect<void | boolean> {
    if (typeof first === "string") {
      const fields = Object.entries(second).map(([label, value]) => ({
        label,
        value: String(value ?? ""),
      }));
      const options = typeof third === "object" ? third : undefined;
      return screen
        .document(second, Schema.Unknown, options)
        .pipe(
          Effect.flatMap((emitted) =>
            emitted
              ? Effect.succeed(true)
              : screen
                  .result([
                    { _tag: "fields", fields },
                    ...suggestionsDoc(options?.suggestions, options),
                  ])
                  .pipe(Effect.as(false)),
          ),
        );
    }
    if (!("fields" in second)) return Effect.void;
    return screen.result([
      ...(typeof third === "string"
        ? [{ _tag: "headline", tone: "neutral", text: third } as const]
        : []),
      {
        _tag: "fields",
        fields: resolveDetailFields(second).map((field) => ({
          label: field.label,
          value: field.render(first),
        })),
      },
    ]);
  }

  function tree<T>(
    roots: ReadonlyArray<TreeNode<T>>,
    def: TreeDef<T>,
    title?: string,
  ): Effect.Effect<void>;
  function tree<T extends object>(entity: string, payload: TreePayload<T>): Effect.Effect<boolean>;
  function tree<T extends object>(
    first: string | ReadonlyArray<TreeNode<T>>,
    second: TreePayload<T> | TreeDef<T>,
    third?: string,
  ): Effect.Effect<void | boolean> {
    if (typeof first === "string" && "roots" in second) {
      return screen
        .document({ roots: second.roots }, Schema.Unknown, second)
        .pipe(
          Effect.flatMap((emitted) =>
            emitted
              ? Effect.succeed(true)
              : screen.note(suggestionsDoc(second.suggestions, second)).pipe(Effect.as(false)),
          ),
        );
    }
    if (typeof first === "string" || !("label" in second)) return Effect.void;
    return screen.result([
      ...(third === undefined ? [] : [{ _tag: "headline", tone: "neutral", text: third } as const]),
      { _tag: "tree", roots: treeItems(first, second) },
    ]);
  }

  return {
    intro: (title) => noteLog("message", title),
    outro: (message) => noteLog("message", message),
    message: (message) => noteLog("message", message),
    instruction: (message) =>
      screen.note([{ _tag: "paragraph", text: message }], { persistent: true }),
    diagnostic: (content) => screen.note([{ _tag: "raw", content }]),
    diagnosticTable: (items, view, caption) => screen.note(tableOutput(items, view, caption)),
    info: (message) => noteLog("info", message),
    success: (message, options) =>
      screen.result([
        { _tag: "headline", tone: "ok", text: message },
        ...(options?.summary === undefined
          ? []
          : [
              {
                _tag: "section",
                children: [{ _tag: "raw", content: options.summary }],
              } as const,
            ]),
        ...suggestionsDoc(options?.suggestions, options),
      ]),
    step: (message) => screen.note(progressDoc("step", 0, message)),
    warn: (message) => noteLog("warn", message),
    error: (message, options) =>
      screen.note([...logDoc("error", message), ...suggestionsDoc(options?.suggestions, options)]),
    suggestions: (suggestions, options) => screen.note(suggestionsDoc(suggestions, options)),
    cancel: (message) =>
      message === undefined ? Effect.void : screen.log({ level: "info", message }),
    note: (message, title) =>
      screen.note([
        {
          _tag: "callout",
          tone: "info",
          title: title ?? "Note",
          children: [{ _tag: "paragraph", text: message }],
        },
      ]),
    box: (message, title) =>
      screen.note([
        {
          _tag: "callout",
          tone: "info",
          title: title ?? "Note",
          children: [{ _tag: "paragraph", text: message }],
        },
      ]),
    streamLog: <E, R>(level: LogLevel, stream: Stream.Stream<string, E, R>) =>
      Stream.runCollect(stream).pipe(
        Effect.flatMap((chunks) =>
          screen.log({
            level:
              level === "warn"
                ? "warn"
                : level === "error"
                  ? "error"
                  : level === "success"
                    ? "info"
                    : level === "message" || level === "step"
                      ? "info"
                      : level,
            message: Array.from(chunks).join(""),
          }),
        ),
      ),
    spinner: (message) =>
      screen.note(progressDoc("start", 0, message)).pipe(Effect.as(spinner(screen, message))),
    withSpinner,
    progress: (config: ProgressConfig, message?: string) => {
      let done = 0;
      const max = Math.max(config.max ?? 100, 1);
      const label = message ?? "Progress";
      return screen.note(progressDoc("progress", 0, label)).pipe(
        Effect.as({
          ...spinner(screen, label, "progress"),
          advance: (step, next) => {
            done = Math.min(max, done + (step ?? 1));
            return screen.note(
              progressDoc("progress", Math.round((done / max) * 100), next ?? label),
            );
          },
        }),
      );
    },
    withProgress: <A, E, R>(
      config: ProgressConfig,
      message: string,
      body: (handle: ProgressHandle) => Effect.Effect<A, E, R>,
      stopMessage?: string,
    ) =>
      screen.task(
        message,
        (handle) => {
          let done = 0;
          const max = Math.max(config.max ?? 100, 1);
          return body({
            ...spinner(screen, message, "progress"),
            stop: (next) => handle.update(next ?? stopMessage ?? message),
            update: (next) => (next === undefined ? Effect.void : handle.update(next)),
            advance: (step, next) => {
              done = Math.min(max, done + (step ?? 1));
              return handle
                .progress(done, max)
                .pipe(Effect.andThen(next === undefined ? Effect.void : handle.update(next)));
            },
          });
        },
        { phase: "progress" },
      ),
    taskLog: (config) => Effect.succeed(taskLog(screen, config.title)),
    withTaskLog: (config, body) => body(taskLog(screen, config.title)),
    runTasks: (tasks) =>
      Effect.forEach(
        tasks.filter((task) => task.enabled !== false),
        (task) =>
          withSpinner(task.title, (handle) => task.task((message) => handle.update(message)), {
            successMessage: (result) => taskCompletionMessage(task.title, result),
          }),
        { concurrency: 1 },
      ).pipe(Effect.asVoid),
    table: (items, view, caption) => screen.result(tableOutput(items, view, caption)),
    list: (entity, payload: ListPayload<object>) => {
      const machineData = {
        items: payload.items,
        ...(payload.count === undefined ? {} : { count: payload.count }),
      };
      return screen.document(machineData, Schema.Unknown, payload).pipe(
        Effect.flatMap((emitted) => {
          if (emitted) return Effect.succeed(true);
          const doc =
            payload.items.length === 0
              ? [
                  {
                    _tag: "paragraph",
                    text: payload.emptyMessage ?? "",
                  } as const,
                ]
              : [
                  {
                    _tag: "headline",
                    tone: "neutral",
                    text: payload.summary ?? count(payload.count ?? payload.items.length, entity),
                  } as const,
                  ...genericTable(payload.items),
                ];
          return screen
            .result([...doc, ...suggestionsDoc(payload.suggestions, payload)])
            .pipe(Effect.as(true));
        }),
      );
    },
    detail,
    tree,
    result: screen.document,
    json: (data) => screen.result([{ _tag: "raw", content: JSON.stringify(data, null, 2) }]),
    raw: (content) => screen.result([{ _tag: "raw", content }]),
    markdown: (content) => screen.result([{ _tag: "markdown", content }]),
  };
};
