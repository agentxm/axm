import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import {
  CliRenderer,
  type BreadcrumbOptions,
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
import type { Breadcrumb } from "../cli-runtime/breadcrumb.js";
import * as chrome from "./ansi-chrome.js";
import { resolveDetailFields, resolveTableColumns } from "./command-output.js";
import { getEntityView } from "./entity-registry.js";
import { formatMarkdown } from "./markdown-formatter.js";
import { resolveCliOutputPolicy, type CliOutputPolicy } from "./output-policy.js";
import { formatTable, getTerminalWidth, pad } from "./table-formatter.js";

const ANSI_DIM = "\u001b[2m";
const ANSI_RESET = "\u001b[0m";

// ---------------------------------------------------------------------------
// Stdout helpers
// ---------------------------------------------------------------------------

const writeStdout = (content: string) =>
  Effect.sync(() => {
    process.stdout.write(content);
  });

const writeStdoutLine = (content: string) =>
  Effect.sync(() => {
    process.stdout.write(content + "\n");
  });

const writeStderrLine = (content: string) =>
  Effect.sync(() => {
    process.stderr.write(content + "\n");
  });

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

const taskCompletionMessage = (title: string, result: string | void): string => {
  if (result === undefined || result.length === 0 || result === title) {
    return title;
  }
  if (result.startsWith(`${title}:`) || result.startsWith(`${title} `)) {
    return result;
  }
  return `${title}: ${result}`;
};

const formatTerminalLink = (url: string, outputPolicy: CliOutputPolicy): string =>
  outputPolicy.colors ? `\u001b]8;;${url}\u001b\\${url}\u001b]8;;\u001b\\` : url;

const formatBreadcrumbAction = (crumb: Breadcrumb, outputPolicy: CliOutputPolicy): string => {
  if (crumb.cmd !== undefined) {
    return crumb.cmd;
  }
  if (crumb.url !== undefined) {
    return formatTerminalLink(crumb.url, outputPolicy);
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

const indentedMessage = (depth: number, message: string): string =>
  `${" ".repeat(depth)}${message}`;

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

const normalizeBreadcrumbs = (
  crumbs: ReadonlyArray<Breadcrumb> | undefined,
  options?: BreadcrumbOptions,
): ReadonlyArray<Breadcrumb> =>
  options?.withoutBreadcrumbs === true || crumbs === undefined || crumbs.length === 0 ? [] : crumbs;

const renderBreadcrumbs = (
  crumbs: ReadonlyArray<Breadcrumb>,
  outputPolicy: CliOutputPolicy,
  options?: BreadcrumbOptions,
): Effect.Effect<void> => {
  const visible = normalizeBreadcrumbs(crumbs, options);
  if (visible.length === 0) {
    return Effect.void;
  }

  const lines = [
    dim("Next:", outputPolicy),
    ...visible.map((crumb) => {
      const formatted = formatBreadcrumbAction(crumb, outputPolicy);
      const command = formatted.length === 0 ? "" : dim(` · ${formatted}`, outputPolicy);
      return `  ${crumb.description}${command}`;
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
    info: (message) => renderLogLine(outputPolicy, "info", message),
    success: (message, options?: SuccessOptions) =>
      renderLogLine(outputPolicy, "success", message).pipe(
        Effect.andThen(renderBreadcrumbs(options?.breadcrumbs ?? [], outputPolicy, options)),
      ),
    step: (message) => renderLogLine(outputPolicy, "step", message),
    warn: (message) => renderLogLine(outputPolicy, "warn", message),
    error: (message, options?: BreadcrumbOptions) =>
      renderLogLine(outputPolicy, "error", message).pipe(
        Effect.andThen(renderBreadcrumbs(options?.breadcrumbs ?? [], outputPolicy, options)),
      ),
    breadcrumbs: (crumbs, options) => renderBreadcrumbs(crumbs, outputPolicy, options),
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
      const columns = resolveTableColumns(view);
      const output = formatTable(items, columns, caption);
      if (output) return writeStdoutLine(output);
      return Effect.void;
    },
    list: <T extends object>(entity: string, payload: ListPayload<T>) => {
      const view = getEntityView<T>(entity)?.list;
      if (payload.items.length === 0) {
        return view?.emptyMessage === undefined
          ? Effect.succeed(false)
          : writeStdoutLine(view.emptyMessage).pipe(Effect.as(false));
      }
      const tableView =
        view === undefined ? makeGenericTableView(payload.items) : { columns: view.columns };
      const output = formatTable(payload.items, resolveTableColumns(tableView));
      return (output ? writeStdoutLine(output) : Effect.void).pipe(
        Effect.andThen(renderBreadcrumbs(payload.breadcrumbs ?? [], outputPolicy, payload)),
        Effect.as(false),
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
          Effect.andThen(renderBreadcrumbs(options?.breadcrumbs ?? [], outputPolicy, options)),
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
          Effect.andThen(renderBreadcrumbs(payload.breadcrumbs ?? [], outputPolicy, payload)),
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
    resultStream: () => Effect.succeed(false),

    // Both modes
    json: (data) => writeStdoutLine(JSON.stringify(data, null, 2)),
    raw: (content) => writeStdout(content),
    markdown: (content) =>
      outputPolicy.colors
        ? writeStdout(formatMarkdown(content, getTerminalWidth(), true))
        : writeStdout(content),
  });
};
