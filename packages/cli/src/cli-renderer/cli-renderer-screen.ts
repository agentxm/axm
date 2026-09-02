import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

import {
  OutputStreams,
  Screen,
  encodeMachineEvent,
  logEvent,
  progressEvent,
  suggestionEvent,
  type Doc,
  type TreeItem,
} from "../screen/index.js";
import {
  CliRenderer,
  type BoxOptions,
  type DetailOptions,
  type DetailView,
  type ListPayload,
  type LogLevel,
  type ProgressConfig,
  type ProgressHandle,
  type SpinnerHandle,
  type SpinnerOptions,
  type SuggestionOptions,
  type SuccessOptions,
  type TableView,
  type TaskLogConfig,
  type TaskLogGroupHandle,
  type TaskLogHandle,
  type TreeDef,
  type TreeNode,
  type TreePayload,
} from "./cli-renderer.js";
import { resolveDetailFields, resolveTableColumns } from "./command-output.js";
import { count } from "./count.js";
import { getEntityView } from "./entity-registry.js";
import type { CliOutputPolicy } from "./output-policy.js";
import { normalizeSuggestions, taskCompletionMessage } from "./renderer-helpers.js";

const toneForLevel = (level: LogLevel) => {
  if (level === "success") return "ok" as const;
  if (level === "warn") return "warn" as const;
  if (level === "error") return "error" as const;
  if (level === "info" || level === "step") return "info" as const;
  return "neutral" as const;
};

const logDoc = (level: LogLevel, message: string): Doc => [
  level === "message"
    ? { _tag: "paragraph", text: message }
    : { _tag: "headline", tone: toneForLevel(level), text: message },
];

const suggestionsDoc = (
  suggestions: ReadonlyArray<SuggestedAction> | undefined,
  options?: SuggestionOptions,
): Doc => {
  const visible = normalizeSuggestions(suggestions, options);
  return visible.length === 0 ? [] : [{ _tag: "next", actions: visible }];
};

const tableDoc = <T extends object>(
  items: ReadonlyArray<T>,
  view: TableView<T>,
  caption?: string,
): Doc => {
  const columns = resolveTableColumns(view);
  if (columns.length === 0) return [];
  return [
    {
      _tag: "table",
      columns: columns.map((column) => ({ header: column.header, align: column.align })),
      rows: items.map((item) => columns.map((column) => column.render(item))),
      ...(caption === undefined ? {} : { caption }),
    },
  ];
};

const genericTableDoc = (items: ReadonlyArray<object>, caption?: string): Doc => {
  const keys = [...new Set(items.flatMap((item) => Object.keys(item)))];
  return keys.length === 0
    ? []
    : [
        {
          _tag: "table",
          columns: keys.map((key) => ({ header: key })),
          rows: items.map((item) =>
            keys.map((key) => {
              const entry = Object.entries(item).find(([entryKey]) => entryKey === key);
              return entry === undefined || entry[1] == null ? "" : String(entry[1]);
            }),
          ),
          ...(caption === undefined ? {} : { caption }),
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

const taskLogHandle = (screen: typeof Screen.Service, title: string): TaskLogHandle => {
  const group = (name: string): TaskLogGroupHandle => ({
    message: (message) => screen.note([{ _tag: "paragraph", text: `[${name}] ${message}` }]),
    error: (message) =>
      screen.note([{ _tag: "callout", tone: "error", title: `[${name}] ${message}` }]),
    success: (message) =>
      screen.note([{ _tag: "headline", tone: "ok", text: `[${name}] ${message}` }]),
  });
  return {
    message: (message) => screen.note([{ _tag: "paragraph", text: `[${title}] ${message}` }]),
    group: (name) => Effect.succeed(group(name)),
    error: (message) =>
      screen.note([{ _tag: "callout", tone: "error", title: `[${title}] ${message}` }]),
    success: (message) =>
      screen.note([{ _tag: "headline", tone: "ok", text: `[${title}] ${message}` }]),
  };
};

const spinnerHandle = (screen: typeof Screen.Service, label: string): SpinnerHandle => ({
  stop: (message) => screen.note([{ _tag: "headline", tone: "ok", text: message ?? label }]),
  update: (message) =>
    message === undefined
      ? Effect.void
      : screen.note([{ _tag: "paragraph", tone: "dim", text: message }]),
  cancel: (message) =>
    screen.note([{ _tag: "headline", tone: "warn", text: message ?? "Cancelled" }]),
  error: (message) => screen.note([{ _tag: "headline", tone: "error", text: message ?? "Error" }]),
  clear: () => Effect.void,
});

export const CliRendererFromScreen = (options: {
  readonly outputPolicy: CliOutputPolicy;
  readonly mode: "text" | "machine";
}): Layer.Layer<CliRenderer, never, OutputStreams | Screen> =>
  Layer.effect(
    CliRenderer,
    Effect.gen(function* () {
      const screen = yield* Screen;
      const streams = yield* OutputStreams;
      const quiet = options.outputPolicy.quiet;
      const noteLog = (level: LogLevel, message: string) =>
        quiet && (level === "message" || level === "info" || level === "step")
          ? Effect.void
          : screen.note(logDoc(level, message));
      const withSpinner = <A, E, R>(
        message: string,
        body: (handle: SpinnerHandle) => Effect.Effect<A, E, R>,
        taskOptions?: SpinnerOptions<A>,
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
          taskOptions,
        );

      const isDetailOptions = (value: string | DetailOptions | undefined): value is DetailOptions =>
        typeof value === "object" && value !== null;
      const isDetailView = <T extends object>(value: T | DetailView<T>): value is DetailView<T> =>
        "fields" in value;

      function detail<T extends object>(
        item: T,
        view: DetailView<T>,
        title?: string,
      ): Effect.Effect<void>;
      function detail<T extends object>(
        entity: string,
        item: T,
        detailOptions?: DetailOptions,
      ): Effect.Effect<boolean>;
      function detail<T extends object>(
        first: string | T,
        second: T | DetailView<T>,
        third?: string | DetailOptions,
      ): Effect.Effect<void | boolean> {
        if (typeof first === "string" && typeof second === "object" && second !== null) {
          const view = getEntityView<object>(first)?.detail;
          const fields =
            view === undefined
              ? Object.entries(second).map(([label, value]) => ({
                  label,
                  value: String(value ?? ""),
                }))
              : resolveDetailFields({ fields: view.fields }).map((field) => ({
                  label: field.label,
                  value: field.render(second),
                }));
          const detailOptions = isDetailOptions(third) ? third : undefined;
          return screen
            .document(second, Schema.Unknown, detailOptions)
            .pipe(
              Effect.flatMap((emitted) =>
                emitted
                  ? Effect.succeed(true)
                  : screen
                      .result([
                        { _tag: "fields", fields },
                        ...suggestionsDoc(detailOptions?.suggestions, detailOptions),
                      ])
                      .pipe(Effect.as(false)),
              ),
            );
        }
        if (typeof first === "string" || !isDetailView(second)) {
          return Effect.void;
        }
        const fields = resolveDetailFields(second).map((field) => ({
          label: field.label,
          value: field.render(first),
        }));
        return screen.result([
          ...(typeof third === "string"
            ? [{ _tag: "headline", tone: "neutral", text: third } as const]
            : []),
          { _tag: "fields", fields },
        ]);
      }

      type LegacyTreePayload<T> = SuccessOptions & {
        readonly roots: ReadonlyArray<TreeNode<T>>;
      };
      const isTreePayload = <T>(
        value: LegacyTreePayload<T> | TreeDef<T>,
      ): value is LegacyTreePayload<T> => "roots" in value;
      const isTreeDef = <T>(value: LegacyTreePayload<T> | TreeDef<T>): value is TreeDef<T> =>
        "label" in value;

      function tree<T>(
        roots: ReadonlyArray<TreeNode<T>>,
        def: TreeDef<T>,
        title?: string,
      ): Effect.Effect<void>;
      function tree<T extends object>(
        entity: string,
        payload: TreePayload<T>,
      ): Effect.Effect<boolean>;
      function tree<T extends object>(
        first: string | ReadonlyArray<TreeNode<T>>,
        second: LegacyTreePayload<T> | TreeDef<T>,
        third?: string,
      ): Effect.Effect<void | boolean> {
        if (typeof first === "string" && isTreePayload(second)) {
          const payload = second;
          const view = getEntityView<object>(first)?.tree;
          if (view === undefined) return Effect.succeed(false);
          return screen
            .document({ roots: payload.roots }, Schema.Unknown, payload)
            .pipe(
              Effect.flatMap((emitted) =>
                emitted
                  ? Effect.succeed(true)
                  : screen
                      .result([
                        { _tag: "tree", roots: treeItems(payload.roots, view) },
                        ...suggestionsDoc(payload.suggestions, payload),
                      ])
                      .pipe(Effect.as(false)),
              ),
            );
        }
        if (typeof first === "string" || !isTreeDef(second)) return Effect.void;
        return screen.result([
          ...(typeof third === "string"
            ? [{ _tag: "headline", tone: "neutral", text: third } as const]
            : []),
          { _tag: "tree", roots: treeItems(first, second) },
        ]);
      }

      const service: typeof CliRenderer.Service = {
        intro: (title) => noteLog("message", title),
        outro: (message) => noteLog("message", message),
        message: (message) => noteLog("message", message),
        instruction: (message) =>
          screen.note([{ _tag: "paragraph", text: message }], { persistent: true }),
        diagnostic: (content) => (quiet ? Effect.void : screen.note([{ _tag: "raw", content }])),
        diagnosticTable: <T extends object>(
          items: ReadonlyArray<T>,
          view: TableView<T>,
          caption?: string,
        ) => (quiet ? Effect.void : screen.note(tableDoc(items, view, caption))),
        info: (message) => noteLog("info", message),
        success: (message, successOptions?: SuccessOptions) =>
          screen.result([
            { _tag: "headline", tone: "ok", text: message },
            ...(successOptions?.summary === undefined
              ? []
              : [{ _tag: "raw", content: successOptions.summary } as const]),
            ...suggestionsDoc(successOptions?.suggestions, successOptions),
          ]),
        step: (message) => noteLog("step", message),
        warn: (message) => screen.note(logDoc("warn", message)),
        error: (message, errorOptions?: SuggestionOptions) =>
          screen.note([
            ...logDoc("error", message),
            ...suggestionsDoc(errorOptions?.suggestions, errorOptions),
          ]),
        suggestions: (suggestions, suggestionOptions) =>
          screen.note(suggestionsDoc(suggestions, suggestionOptions)),
        cancel: (message) => noteLog("warn", message ?? "Cancelled"),
        note: (message, title) =>
          quiet
            ? Effect.void
            : screen.note([
                {
                  _tag: "callout",
                  tone: "info",
                  title: title ?? "Note",
                  children: [{ _tag: "paragraph", text: message }],
                },
              ]),
        box: (message, title, _boxOptions?: BoxOptions) =>
          quiet
            ? Effect.void
            : screen.note([
                {
                  _tag: "callout",
                  tone: "info",
                  title: title ?? "Note",
                  children: [{ _tag: "paragraph", text: message }],
                },
              ]),
        streamLog: <E, R>(level: LogLevel, stream: Stream.Stream<string, E, R>) =>
          Stream.runCollect(stream).pipe(
            Effect.flatMap((chunks) => noteLog(level, Array.from(chunks).join(""))),
          ),
        spinner: (message) => Effect.succeed(spinnerHandle(screen, message)),
        withSpinner,
        progress: (config: ProgressConfig, message?: string) => {
          let done = 0;
          const max = Math.max(config.max ?? 100, 1);
          const handle: ProgressHandle = {
            ...spinnerHandle(screen, message ?? "Progress"),
            advance: (step, nextMessage) => {
              done = Math.min(max, done + (step ?? 1));
              return screen.note([
                {
                  _tag: "paragraph",
                  tone: "dim",
                  text: `${nextMessage ?? message ?? "Progress"} (${done}/${max})`,
                },
              ]);
            },
          };
          return Effect.succeed(handle);
        },
        withProgress: <A, E, R>(
          config: ProgressConfig,
          message: string,
          body: (handle: ProgressHandle) => Effect.Effect<A, E, R>,
          stopMessage?: string,
        ) =>
          screen.task(message, (task) => {
            let done = 0;
            const max = Math.max(config.max ?? 100, 1);
            return body({
              ...spinnerHandle(screen, message),
              stop: (next) => task.update(next ?? stopMessage ?? message),
              update: (next) => (next === undefined ? Effect.void : task.update(next)),
              advance: (step, next) => {
                done = Math.min(max, done + (step ?? 1));
                return task
                  .progress(done, max)
                  .pipe(Effect.andThen(next === undefined ? Effect.void : task.update(next)));
              },
            });
          }),
        taskLog: (config: TaskLogConfig) => Effect.succeed(taskLogHandle(screen, config.title)),
        withTaskLog: <A, E, R>(
          config: TaskLogConfig,
          body: (handle: TaskLogHandle) => Effect.Effect<A, E, R>,
        ) => body(taskLogHandle(screen, config.title)),
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
            tasks.filter((task) => task.enabled !== false),
            (task) =>
              withSpinner(task.title, (handle) => task.task((message) => handle.update(message)), {
                successMessage: (result) => taskCompletionMessage(task.title, result),
              }),
            { concurrency: 1 },
          ).pipe(Effect.asVoid),
        table: <T extends object>(items: ReadonlyArray<T>, view: TableView<T>, caption?: string) =>
          screen.result(tableDoc(items, view, caption)),
        list: <T extends object>(entity: string, payload: ListPayload<T>) => {
          const machineData = {
            items: payload.items,
            ...(payload.count === undefined ? {} : { count: payload.count }),
          };
          return screen.document(machineData, Schema.Unknown, payload).pipe(
            Effect.flatMap((emitted) => {
              if (emitted) return Effect.succeed(true);
              const view = getEntityView<T>(entity)?.list;
              const doc =
                payload.items.length === 0
                  ? payload.emptyMessage === undefined && view?.emptyMessage === undefined
                    ? []
                    : [
                        {
                          _tag: "paragraph",
                          text: payload.emptyMessage ?? view?.emptyMessage ?? "",
                        } as const,
                      ]
                  : [
                      {
                        _tag: "headline",
                        tone: "neutral",
                        text:
                          payload.summary ??
                          count(
                            payload.count ?? payload.items.length,
                            view?.singularLabel ?? entity,
                            view?.pluralLabel,
                          ),
                      } as const,
                      ...(view === undefined
                        ? genericTableDoc(payload.items)
                        : tableDoc(payload.items, { columns: view.columns })),
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

      if (options.mode === "text") return service;

      const emit = (event: Parameters<typeof encodeMachineEvent>[0]) =>
        streams.stderr(encodeMachineEvent(event));
      const machineLevel = (value: LogLevel): "info" | "warn" | "error" =>
        value === "warn" ? "warn" : value === "error" ? "error" : "info";
      const emitSuggestions = (
        suggestions: ReadonlyArray<SuggestedAction> | undefined,
        suggestionOptions?: SuggestionOptions,
      ) =>
        Effect.forEach(
          normalizeSuggestions(suggestions, suggestionOptions),
          (suggestion) => emit(suggestionEvent(suggestion)),
          { concurrency: 1 },
        ).pipe(Effect.asVoid);
      const machineSpinner = (phase: string, initial = ""): SpinnerHandle => {
        let current = initial;
        return {
          stop: (message) => {
            current = message ?? current;
            return current.length === 0 ? Effect.void : emit(progressEvent(phase, 100, current));
          },
          update: (message, detail) => {
            current = message ?? current;
            return current.length === 0
              ? Effect.void
              : emit(progressEvent(phase, -1, current, detail));
          },
          cancel: (message) => emit(progressEvent(phase, -1, message ?? "Cancelled")),
          error: (message) => emit(logEvent("error", message ?? "Error")),
          clear: () => Effect.void,
        };
      };
      const machineProgress = (
        phase: string,
        config: ProgressConfig,
        initial?: string,
      ): ProgressHandle => {
        const max = Math.max(config.max ?? 100, 1);
        let done = 0;
        let current = initial ?? "";
        return {
          ...machineSpinner(phase, initial),
          stop: (message) => {
            current = message ?? current;
            return current.length === 0 ? Effect.void : emit(progressEvent(phase, 100, current));
          },
          update: (message) => {
            current = message ?? current;
            return current.length === 0
              ? Effect.void
              : emit(progressEvent(phase, Math.round((done / max) * 100), current));
          },
          advance: (step, message) => {
            done = Math.min(max, done + (step ?? 1));
            current = message ?? current;
            return current.length === 0
              ? Effect.void
              : emit(progressEvent(phase, Math.round((done / max) * 100), current));
          },
        };
      };

      return {
        ...service,
        intro: () => Effect.void,
        outro: () => Effect.void,
        message: () => Effect.void,
        instruction: service.instruction,
        diagnostic: () => Effect.void,
        diagnosticTable: () => Effect.void,
        info: () => Effect.void,
        success: () => Effect.void,
        step: (message) => emit(progressEvent("step", 0, message)),
        warn: (message) => emit(logEvent("warn", message)),
        error: (message, errorOptions) =>
          emit(logEvent("error", message)).pipe(
            Effect.andThen(emitSuggestions(errorOptions?.suggestions, errorOptions)),
          ),
        suggestions: emitSuggestions,
        cancel: (message) =>
          message === undefined ? Effect.void : emit(logEvent("info", message)),
        note: () => Effect.void,
        box: () => Effect.void,
        streamLog: <E, R>(level: LogLevel, stream: Stream.Stream<string, E, R>) =>
          Stream.runCollect(stream).pipe(
            Effect.flatMap((chunks) =>
              emit(logEvent(machineLevel(level), Array.from(chunks).join(""))),
            ),
          ),
        spinner: (message) =>
          quiet
            ? Effect.succeed(machineSpinner("start"))
            : emit(progressEvent("start", 0, message)).pipe(
                Effect.as(machineSpinner("start", message)),
              ),
        progress: (config, message) =>
          quiet || message === undefined
            ? Effect.succeed(machineProgress("progress", config, message))
            : emit(progressEvent("progress", 0, message)).pipe(
                Effect.as(machineProgress("progress", config, message)),
              ),
        withProgress: <A, E, R>(
          config: ProgressConfig,
          message: string,
          body: (handle: ProgressHandle) => Effect.Effect<A, E, R>,
          stopMessage?: string,
        ) => {
          const handle = machineProgress("progress", config, message);
          return (quiet ? Effect.void : emit(progressEvent("progress", 0, message))).pipe(
            Effect.andThen(body(handle)),
            Effect.tap(() => (quiet ? Effect.void : handle.stop(stopMessage))),
          );
        },
        taskLog: (config) =>
          Effect.succeed(
            quiet
              ? taskLogHandle({ ...screen, log: () => Effect.void }, config.title)
              : {
                  message: (message: string) =>
                    emit(logEvent("info", `[${config.title}] ${message}`)),
                  group: (name: string) =>
                    Effect.succeed({
                      message: (message: string) => emit(logEvent("info", `[${name}] ${message}`)),
                      error: (message: string) => emit(logEvent("error", `[${name}] ${message}`)),
                      success: (message: string) => emit(logEvent("info", `[${name}] ${message}`)),
                    }),
                  error: (message: string) =>
                    emit(logEvent("error", `[${config.title}] ${message}`)),
                  success: (message: string) =>
                    emit(logEvent("info", `[${config.title}] ${message}`)),
                },
          ),
        withTaskLog: <A, E, R>(
          config: TaskLogConfig,
          body: (handle: TaskLogHandle) => Effect.Effect<A, E, R>,
        ) =>
          Effect.flatMap(
            quiet
              ? Effect.succeed(taskLogHandle(screen, config.title))
              : Effect.succeed({
                  message: (message: string) =>
                    emit(logEvent("info", `[${config.title}] ${message}`)),
                  group: (name: string) =>
                    Effect.succeed({
                      message: (message: string) => emit(logEvent("info", `[${name}] ${message}`)),
                      error: (message: string) => emit(logEvent("error", `[${name}] ${message}`)),
                      success: (message: string) => emit(logEvent("info", `[${name}] ${message}`)),
                    }),
                  error: (message: string) =>
                    emit(logEvent("error", `[${config.title}] ${message}`)),
                  success: (message: string) =>
                    emit(logEvent("info", `[${config.title}] ${message}`)),
                } satisfies TaskLogHandle),
            body,
          ),
        table: () => Effect.void,
        json: (data) => streams.stdout(`${JSON.stringify(data, null, 2)}\n`),
        raw: streams.stdout,
        markdown: streams.stdout,
      };
    }),
  );
