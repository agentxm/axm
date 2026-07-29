import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import {
  CliRenderer,
  type SuggestionOptions,
  type DetailView,
  type DetailOptions,
  type ListPayload,
  type LogLevel,
  type ResolvedDetailField,
  type ProgressConfig,
  type ProgressHandle,
  type SpinnerHandle,
  type SpinnerOptions,
  type SuccessOptions,
  type TaskLogConfig,
  type TaskLogGroupHandle,
  type TaskLogHandle,
  type TableView,
  type TreePayload,
  type TreeDef,
  type TreeNode,
} from "./cli-renderer.js";
import type { SuggestedAction } from "../cli-runtime/suggested-action.js";
import * as chrome from "./ansi-chrome.js";
import { resolveDetailFields, resolveTableColumns } from "./command-output.js";
import { count } from "./count.js";
import { getEntityView } from "./entity-registry.js";
import { formatMarkdown } from "./markdown-formatter.js";
import { resolveCliOutputPolicy, type CliOutputPolicy } from "./output-policy.js";
import {
  indentedMessage,
  normalizeSuggestions,
  taskCompletionMessage,
  writeStderrLine,
  writeStdout,
  writeStdoutLine,
} from "./renderer-helpers.js";
import { formatTable, getTerminalWidth, pad } from "./table-formatter.js";

const ANSI_DIM = "\u001b[2m";
const ANSI_RESET = "\u001b[0m";

// ---------------------------------------------------------------------------
// Detail formatter
// ---------------------------------------------------------------------------

const formatDetail = <T extends object>(
  item: T,
  fields: ReadonlyArray<ResolvedDetailField<T>>,
  title?: string,
): string => {
  if (fields.length === 0) return "";

  const lines: Array<string> = [];

  if (title) {
    lines.push(title);
  }

  const maxLabelWidth = Math.max(...fields.map((field) => field.label.length));

  for (const field of fields) {
    const label = pad(field.label, maxLabelWidth, "left");
    const value = field.render(item);
    lines.push(`${label}  ${value}`);
  }

  return lines.join("\n");
};

// ---------------------------------------------------------------------------
// Tree formatter
// ---------------------------------------------------------------------------

const formatTree = <T>(
  roots: ReadonlyArray<TreeNode<T>>,
  def: TreeDef<T>,
  title?: string,
): string => {
  if (roots.length === 0) return "";

  const lines: Array<string> = [];

  if (title) {
    lines.push(title);
  }

  const renderNode = (node: TreeNode<T>, prefix: string, isLast: boolean) => {
    const connector = isLast ? "\u2514\u2500 " : "\u251C\u2500 "; // "└─ " or "├─ "
    const icon = def.icon?.(node.data);
    const label = def.label(node.data);
    const detail = def.detail?.(node.data);

    let line = `${prefix}${connector}`;
    if (icon) line += `${icon} `;
    line += label;
    if (detail) line += `  ${detail}`;
    lines.push(line);

    const children = node.children ?? [];
    const childPrefix = prefix + (isLast ? "   " : "\u2502  ");
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child !== undefined) {
        renderNode(child, childPrefix, i === children.length - 1);
      }
    }
  };

  for (let i = 0; i < roots.length; i++) {
    const root = roots[i];
    if (root !== undefined) {
      renderNode(root, "", i === roots.length - 1);
    }
  }

  return lines.join("\n");
};

const objectKeys = (item: object): ReadonlyArray<string> => Object.keys(item);

const makeGenericTableView = <T extends object>(items: ReadonlyArray<T>): TableView<T> => {
  const sample = items[0];
  const columns =
    sample === undefined
      ? {}
      : Object.fromEntries(
          objectKeys(sample).map((key) => [
            key,
            {
              header: key,
              render: (_value: unknown, row: T) => {
                const value = Object.entries(row).find(([entryKey]) => entryKey === key)?.[1];
                return value == null ? "" : String(value);
              },
            },
          ]),
        );

  // Assertion needed: generic fallback derives keys dynamically from the item object.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return { columns } as unknown as TableView<T>;
};

const makeGenericDetailView = <T extends object>(item: T): DetailView<T> => {
  const fields = Object.fromEntries(
    objectKeys(item).map((key) => [
      key,
      {
        label: key,
        render: (_value: unknown, row: T) => {
          const value = Object.entries(row).find(([entryKey]) => entryKey === key)?.[1];
          return value == null ? "" : String(value);
        },
      },
    ]),
  );

  // Assertion needed: generic fallback derives keys dynamically from the item object.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return { fields } as unknown as DetailView<T>;
};

// ---------------------------------------------------------------------------
// InteractiveRenderer layer
// ---------------------------------------------------------------------------

const formatTerminalLink = (url: string, outputPolicy: CliOutputPolicy): string =>
  outputPolicy.colors ? `\u001b]8;;${url}\u001b\\${url}\u001b]8;;\u001b\\` : url;

const formatSuggestedActionAction = (
  suggestion: SuggestedAction,
  outputPolicy: CliOutputPolicy,
): string => {
  if (suggestion.cmd !== undefined) {
    return suggestion.cmd;
  }
  if (suggestion.url !== undefined) {
    return formatTerminalLink(suggestion.url, outputPolicy);
  }
  return "";
};

const dim = (message: string, outputPolicy: CliOutputPolicy): string =>
  outputPolicy.colors ? `${ANSI_DIM}${message}${ANSI_RESET}` : message;

const plainLine = (symbol: string, message: string): Effect.Effect<void> =>
  writeStderrLine(`${symbol}  ${message}`);

const renderLogLine = (
  outputPolicy: CliOutputPolicy,
  level: LogLevel,
  message: string,
): Effect.Effect<void> => {
  if (outputPolicy.colors) {
    return chrome.logLine(level, message);
  }
  return level === "message" ? writeStderrLine(message) : plainLine(chrome.Symbols[level], message);
};

const plainSpinner = (message: string): Effect.Effect<SpinnerHandle> =>
  plainLine(chrome.Symbols.step, message).pipe(
    Effect.as({
      stop: (nextMessage) => plainLine(chrome.Symbols.success, nextMessage ?? message),
      update: (nextMessage) => plainLine(chrome.Symbols.step, nextMessage ?? message),
      cancel: (nextMessage) => plainLine(chrome.Symbols.cancel, nextMessage ?? message),
      error: (nextMessage) => plainLine(chrome.Symbols.error, nextMessage ?? message),
      clear: () => Effect.void,
    } satisfies SpinnerHandle),
  );

const plainProgress = (
  config: ProgressConfig,
  message: string | undefined,
): Effect.Effect<ProgressHandle> => {
  const max = Math.max(config.max ?? 100, 1);
  let current = 0;
  let currentMessage = message ?? "";

  const renderUpdate = (nextMessage?: string): Effect.Effect<void> => {
    currentMessage = nextMessage ?? currentMessage;
    const percent = Math.round((current / max) * 100);
    const text = currentMessage.length === 0 ? `${percent}%` : `${percent}% ${currentMessage}`;
    return plainLine(chrome.Symbols.step, text);
  };

  const handle: ProgressHandle = {
    stop: (nextMessage) => plainLine(chrome.Symbols.success, nextMessage ?? currentMessage),
    update: renderUpdate,
    cancel: (nextMessage) => plainLine(chrome.Symbols.cancel, nextMessage ?? currentMessage),
    error: (nextMessage) => plainLine(chrome.Symbols.error, nextMessage ?? currentMessage),
    clear: () => Effect.void,
    advance: (step, nextMessage) => {
      current = Math.min(current + (step ?? 1), max);
      return renderUpdate(nextMessage);
    },
  };

  return currentMessage.length === 0
    ? Effect.succeed(handle)
    : plainLine(chrome.Symbols.step, currentMessage).pipe(Effect.as(handle));
};

const plainTaskLogGroup = (depth: number): TaskLogGroupHandle => ({
  message: (message: string) => writeStderrLine(indentedMessage(depth, message)),
  error: (message: string) =>
    writeStderrLine(indentedMessage(depth, `${chrome.Symbols.error}  ${message}`)),
  success: (message: string) =>
    writeStderrLine(indentedMessage(depth, `${chrome.Symbols.success}  ${message}`)),
});

const plainTaskLog = (config: TaskLogConfig): Effect.Effect<TaskLogHandle> =>
  plainLine(chrome.Symbols.step, config.title).pipe(
    Effect.as({
      message: (message: string) => writeStderrLine(indentedMessage(2, message)),
      group: (name: string) =>
        plainLine(chrome.Symbols.step, name).pipe(Effect.as(plainTaskLogGroup(4))),
      error: (message: string) =>
        writeStderrLine(indentedMessage(2, `${chrome.Symbols.error}  ${message}`)),
      success: (message: string) =>
        writeStderrLine(indentedMessage(2, `${chrome.Symbols.success}  ${message}`)),
    } satisfies TaskLogHandle),
  );

const formatListSummary = (
  entity: string,
  itemCount: number,
  view: { readonly singularLabel?: string; readonly pluralLabel?: string } | undefined,
): string => count(itemCount, view?.singularLabel ?? entity, view?.pluralLabel);

const renderSuggestions = (
  suggestions: ReadonlyArray<SuggestedAction>,
  outputPolicy: CliOutputPolicy,
  options?: SuggestionOptions,
): Effect.Effect<void> => {
  const visible = normalizeSuggestions(suggestions, options);
  if (visible.length === 0) {
    return Effect.void;
  }

  const lines = [
    dim("Next:", outputPolicy),
    ...visible.map((suggestion) => {
      const formatted = formatSuggestedActionAction(suggestion, outputPolicy);
      const command = formatted.length === 0 ? "" : dim(` · ${formatted}`, outputPolicy);
      return `  ${suggestion.description}${command}`;
    }),
  ];

  return writeStderrLine(lines.join("\n"));
};

export const InteractiveRenderer = (options?: {
  readonly outputPolicy?: CliOutputPolicy;
}): Layer.Layer<CliRenderer> => {
  const outputPolicy = options?.outputPolicy ?? resolveCliOutputPolicy();
  const renderSpinner = outputPolicy.interactiveActivity ? chrome.spinner : plainSpinner;
  const renderProgress = outputPolicy.interactiveActivity ? chrome.progress : plainProgress;
  const renderTaskLog = outputPolicy.colors ? chrome.taskLog : plainTaskLog;

  const liveWithSpinner = <A, E, R>(
    message: string,
    f: (handle: SpinnerHandle) => Effect.Effect<A, E, R>,
    options?: SpinnerOptions<A>,
  ): Effect.Effect<A, E, R> =>
    Effect.suspend(() => {
      const successMessage =
        typeof options?.successMessage === "string" ? options.successMessage : undefined;
      const successMessageFn =
        typeof options?.successMessage === "function" ? options.successMessage : undefined;
      const failureMessage = options?.failureMessage;

      return renderSpinner(message).pipe(
        Effect.flatMap((handle) =>
          Effect.interruptible(f(handle)).pipe(
            Effect.matchCauseEffect({
              onFailure: (cause) => {
                const finalize = Cause.hasInterruptsOnly(cause)
                  ? handle.cancel()
                  : handle.error(failureMessage ?? message);
                return finalize.pipe(Effect.andThen(Effect.failCause(cause)));
              },
              onSuccess: (value) =>
                handle
                  .stop(successMessageFn?.(value) ?? successMessage ?? message)
                  .pipe(Effect.as(value)),
            }),
            Effect.uninterruptible,
          ),
        ),
      );
    });

  const liveWithProgress = <A, E, R>(
    config: ProgressConfig,
    message: string,
    f: (handle: ProgressHandle) => Effect.Effect<A, E, R>,
    stopMessage?: string,
  ): Effect.Effect<A, E, R> =>
    Effect.suspend(() =>
      renderProgress(config, message).pipe(
        Effect.flatMap((handle) =>
          Effect.interruptible(f(handle)).pipe(
            Effect.matchCauseEffect({
              onFailure: (cause) => {
                const finalize = Cause.hasInterruptsOnly(cause)
                  ? handle.cancel()
                  : handle.error(message);
                return finalize.pipe(Effect.andThen(Effect.failCause(cause)));
              },
              onSuccess: (value) => handle.stop(stopMessage).pipe(Effect.as(value)),
            }),
            Effect.uninterruptible,
          ),
        ),
      ),
    );

  return Layer.succeed(CliRenderer, {
    // Chrome (stderr)
    intro: (title) =>
      outputPolicy.colors ? chrome.intro(title) : plainLine(chrome.Symbols.intro, title),
    outro: (message) =>
      outputPolicy.colors ? chrome.outro(message) : plainLine(chrome.Symbols.outro, message),
    message: (message) => renderLogLine(outputPolicy, "message", message),
    diagnostic: (content) => (outputPolicy.quiet ? Effect.void : writeStderrLine(content)),
    diagnosticTable: <T extends object>(
      items: ReadonlyArray<T>,
      view: TableView<T>,
      caption?: string,
    ) => {
      if (outputPolicy.quiet) return Effect.void;
      const output = formatTable(items, resolveTableColumns(view), caption);
      return output.length === 0 ? Effect.void : writeStderrLine(output);
    },
    info: (message) => renderLogLine(outputPolicy, "info", message),
    success: (message, options?: SuccessOptions) =>
      renderLogLine(outputPolicy, "success", message).pipe(
        Effect.andThen(
          options?.summary !== undefined
            ? writeStderrLine(
                options.summary
                  .split("\n")
                  .map((line) => `  ${line}`)
                  .join("\n"),
              )
            : Effect.void,
        ),
        Effect.andThen(renderSuggestions(options?.suggestions ?? [], outputPolicy, options)),
      ),
    step: (message) => renderLogLine(outputPolicy, "step", message),
    warn: (message) => renderLogLine(outputPolicy, "warn", message),
    error: (message, options?: SuggestionOptions) =>
      renderLogLine(outputPolicy, "error", message).pipe(
        Effect.andThen(renderSuggestions(options?.suggestions ?? [], outputPolicy, options)),
      ),
    suggestions: (suggestions, options) => renderSuggestions(suggestions, outputPolicy, options),
    cancel: (message) =>
      outputPolicy.colors
        ? chrome.cancel(message ?? "Cancelled")
        : plainLine(chrome.Symbols.cancel, message ?? "Cancelled"),
    note: chrome.note,
    box: chrome.box,
    streamLog: <E, R>(level: LogLevel, stream: Stream.Stream<string, E, R>) =>
      outputPolicy.colors
        ? chrome.streamLog(level, stream)
        : Stream.runCollect(stream).pipe(
            Effect.flatMap((chunks) =>
              renderLogLine(outputPolicy, level, Array.from(chunks).join("")),
            ),
          ),

    // Activity
    spinner: renderSpinner,
    withSpinner: liveWithSpinner,
    progress: renderProgress,
    withProgress: liveWithProgress,
    taskLog: renderTaskLog,
    withTaskLog: (config, f) => renderTaskLog(config).pipe(Effect.flatMap((handle) => f(handle))),
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
          liveWithSpinner(task.title, (handle) => task.task((msg) => handle.update(msg)), {
            successMessage: (result) => taskCompletionMessage(task.title, result),
          }),
        { concurrency: 1 },
      ).pipe(Effect.asVoid),

    // Data display (stdout)
    table: <T extends object>(items: ReadonlyArray<T>, view: TableView<T>, caption?: string) => {
      if (outputPolicy.quiet) return Effect.void;
      const columns = resolveTableColumns(view);
      const output = formatTable(items, columns, caption);
      if (output) return writeStdoutLine(output);
      return Effect.void;
    },
    list: <T extends object>(entity: string, payload: ListPayload<T>) => {
      if (outputPolicy.quiet) return Effect.succeed(true);
      const view = getEntityView<T>(entity)?.list;
      if (payload.items.length === 0) {
        const emptyMessage = payload.emptyMessage ?? view?.emptyMessage;
        const renderEmptyMessage =
          emptyMessage === undefined ? Effect.void : writeStdoutLine(emptyMessage);
        return renderEmptyMessage.pipe(
          Effect.andThen(renderSuggestions(payload.suggestions ?? [], outputPolicy, payload)),
          Effect.as(true),
        );
      }
      const tableView =
        view === undefined ? makeGenericTableView(payload.items) : { columns: view.columns };
      const output = formatTable(payload.items, resolveTableColumns(tableView));
      const summary =
        payload.summary ?? formatListSummary(entity, payload.count ?? payload.items.length, view);
      const content =
        output.length === 0
          ? summary
          : [summary, output].filter((line) => line.length > 0).join("\n");
      return writeStdoutLine(content).pipe(
        Effect.andThen(renderSuggestions(payload.suggestions ?? [], outputPolicy, payload)),
        Effect.as(true),
      );
    },
    // Assertion needed: function implements the service's overloaded detail signature.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    detail: ((first: unknown, second: unknown, third?: unknown) => {
      if (typeof first === "string") {
        // Assertion needed: overloaded renderer call narrows by entity string at runtime.
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        const item = second as object;
        // Assertion needed: overloaded renderer call carries options in the third argument.
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        const options = third as DetailOptions | undefined;
        const view = getEntityView<object>(first)?.detail;
        const detailView =
          view === undefined ? makeGenericDetailView(item) : { fields: view.fields };
        const title = options?.title ?? view?.title?.(item);
        const output = formatDetail(item, resolveDetailFields(detailView), title);
        return (output ? writeStdoutLine(output) : Effect.void).pipe(
          Effect.andThen(renderSuggestions(options?.suggestions ?? [], outputPolicy, options)),
          Effect.as(false),
        );
      }

      // Assertion needed: overloaded renderer call carries the item in the first argument.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      const item = first as object;
      // Assertion needed: overloaded renderer call carries the detail view in the second argument.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      const view = second as DetailView<object>;
      const title = typeof third === "string" ? third : undefined;
      const output = formatDetail(item, resolveDetailFields(view), title);
      if (output) return writeStdoutLine(output);
      return Effect.void;
    }) as typeof CliRenderer.Service.detail,
    // Assertion needed: function implements the service's overloaded tree signature.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    tree: ((first: unknown, second: unknown, third?: unknown) => {
      if (typeof first === "string") {
        // Assertion needed: overloaded renderer call carries tree payload in the second argument.
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        const payload = second as TreePayload<object>;
        const view = getEntityView<object>(first)?.tree;
        if (view === undefined) {
          return Effect.succeed(false);
        }
        const output = formatTree(payload.roots, view);
        return (output ? writeStdoutLine(output) : Effect.void).pipe(
          Effect.andThen(renderSuggestions(payload.suggestions ?? [], outputPolicy, payload)),
          Effect.as(false),
        );
      }
      // Assertion needed: overloaded renderer call carries roots in the first argument.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      const roots = first as ReadonlyArray<TreeNode<unknown>>;
      // Assertion needed: overloaded renderer call carries the tree definition in the second argument.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      const def = second as TreeDef<unknown>;
      const title = typeof third === "string" ? third : undefined;
      const output = formatTree(roots, def, title);
      if (output) return writeStdoutLine(output);
      return Effect.void;
    }) as typeof CliRenderer.Service.tree,

    // Machine data output
    result: () => Effect.succeed(false),

    // Both modes
    json: (data) => writeStdoutLine(JSON.stringify(data, null, 2)),
    raw: (content) => writeStdout(content),
    markdown: (content) =>
      outputPolicy.colors
        ? writeStdout(formatMarkdown(content, getTerminalWidth(), true))
        : writeStdout(content),
  });
};
