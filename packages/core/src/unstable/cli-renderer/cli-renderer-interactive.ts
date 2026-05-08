import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  CliRenderer,
  type BreadcrumbOptions,
  type DetailView,
  type ResolvedDetailField,
  type ProgressConfig,
  type ProgressHandle,
  type ResolvedTableColumn,
  type SpinnerHandle,
  type SpinnerOptions,
  type SuccessOptions,
  type TableView,
  type TreeDef,
  type TreeNode,
} from "./cli-renderer.js";
import type { Breadcrumb } from "../cli-runtime/breadcrumb.js";
import * as chrome from "./ansi-chrome.js";
import { resolveDetailFields, resolveTableColumns } from "./command-output.js";

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
// Table formatter
// ---------------------------------------------------------------------------

const getTerminalWidth = (): number => process.stdout.columns ?? 80;

const truncate = (str: string, maxWidth: number): string => {
  if (str.length <= maxWidth) return str;
  if (maxWidth <= 1) return ".";
  return str.slice(0, maxWidth - 1) + "\u2026";
};

const pad = (str: string, width: number, align: "left" | "right"): string => {
  if (str.length >= width) return str;
  const padding = " ".repeat(width - str.length);
  return align === "right" ? padding + str : str + padding;
};

const getWidthAt = (widths: ReadonlyArray<number>, index: number, fallback: number): number =>
  widths[index] ?? fallback;

const formatTable = <T extends object>(
  items: ReadonlyArray<T>,
  columns: ReadonlyArray<ResolvedTableColumn<T>>,
  caption?: string,
): string => {
  if (items.length === 0 || columns.length === 0) return "";

  const termWidth = getTerminalWidth();
  const colGap = 2;
  const availableWidth = termWidth;

  // Compute content widths
  const contentWidths: Array<number> = columns.map((col) => {
    let maxW = col.header.length;
    for (const item of items) {
      const val = col.render(item);
      if (val.length > maxW) maxW = val.length;
    }
    return maxW;
  });

  // Resolve column widths
  const colWidths: Array<number> = [];
  let usedWidth = 0;
  let fillCount = 0;

  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    if (col === undefined) {
      continue;
    }
    if (col.width === "fill") {
      fillCount++;
      colWidths.push(0); // placeholder
    } else if (typeof col.width === "number") {
      colWidths.push(col.width);
      usedWidth += col.width;
    } else {
      // "auto" — use content width
      const w = contentWidths[i] ?? col.header.length;
      colWidths.push(w);
      usedWidth += w;
    }
    if (i < columns.length - 1) usedWidth += colGap;
  }

  // Distribute remaining width to fill columns
  if (fillCount > 0) {
    const remaining = Math.max(0, availableWidth - usedWidth);
    const perFill = Math.max(4, Math.floor(remaining / fillCount));
    for (let i = 0; i < columns.length; i++) {
      if (columns[i]?.width === "fill") {
        colWidths[i] = perFill;
      }
    }
  }

  const lines: Array<string> = [];

  if (caption) {
    lines.push(caption);
  }

  const headerCells = columns.map((col, i) => {
    const width = getWidthAt(colWidths, i, col.header.length);
    return pad(truncate(col.header, width), width, col.align);
  });
  lines.push(headerCells.join(" ".repeat(colGap)));

  const sepCells = columns.map((col, i) =>
    "\u2500".repeat(getWidthAt(colWidths, i, col.header.length)),
  );
  lines.push(sepCells.join(" ".repeat(colGap)));

  for (const item of items) {
    const cells = columns.map((col, i) => {
      const val = col.render(item);
      const width = getWidthAt(colWidths, i, col.header.length);
      return pad(truncate(val, width), width, col.align);
    });
    lines.push(cells.join(" ".repeat(colGap)));
  }

  return lines.join("\n");
};

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

const formatCommand = (command: ReadonlyArray<string>): string => command.join(" ");

const normalizeBreadcrumbs = (
  crumbs: ReadonlyArray<Breadcrumb> | undefined,
  options?: BreadcrumbOptions,
): ReadonlyArray<Breadcrumb> =>
  options?.withoutBreadcrumbs === true || crumbs === undefined || crumbs.length === 0 ? [] : crumbs;

const renderBreadcrumbs = (
  crumbs: ReadonlyArray<Breadcrumb>,
  options?: BreadcrumbOptions,
): Effect.Effect<void> => {
  const visible = normalizeBreadcrumbs(crumbs, options);
  if (visible.length === 0) {
    return Effect.void;
  }

  const lines = [
    `${ANSI_DIM}Next:${ANSI_RESET}`,
    ...visible.map((crumb) => {
      const command =
        crumb.command === undefined
          ? ""
          : `${ANSI_DIM} · ${formatCommand(crumb.command)}${ANSI_RESET}`;
      return `  ${crumb.description}${command}`;
    }),
  ];

  return writeStderrLine(lines.join("\n"));
};

export const InteractiveRenderer = (): Layer.Layer<CliRenderer> => {
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

      return chrome.spinner(message).pipe(
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
      chrome.progress(config, message).pipe(
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
    intro: chrome.intro,
    outro: chrome.outro,
    message: (message) => chrome.logLine("message", message),
    info: (message) => chrome.logLine("info", message),
    success: (message, options?: SuccessOptions) =>
      chrome
        .logLine("success", message)
        .pipe(Effect.andThen(renderBreadcrumbs(options?.breadcrumbs ?? [], options))),
    step: (message) => chrome.logLine("step", message),
    warn: (message) => chrome.logLine("warn", message),
    error: (message, options?: BreadcrumbOptions) =>
      chrome
        .logLine("error", message)
        .pipe(Effect.andThen(renderBreadcrumbs(options?.breadcrumbs ?? [], options))),
    breadcrumbs: renderBreadcrumbs,
    cancel: (message) => chrome.cancel(message ?? "Cancelled"),
    note: chrome.note,
    box: chrome.box,
    streamLog: chrome.streamLog,

    // Activity
    spinner: chrome.spinner,
    withSpinner: liveWithSpinner,
    progress: chrome.progress,
    withProgress: liveWithProgress,
    taskLog: chrome.taskLog,
    withTaskLog: (config, f) => chrome.taskLog(config).pipe(Effect.flatMap((handle) => f(handle))),
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
    detail: <T extends object>(item: T, view: DetailView<T>, title?: string) => {
      const fields = resolveDetailFields(view);
      const output = formatDetail(item, fields, title);
      if (output) return writeStdoutLine(output);
      return Effect.void;
    },
    tree: <T>(roots: ReadonlyArray<TreeNode<T>>, def: TreeDef<T>, title?: string) => {
      const output = formatTree(roots, def, title);
      if (output) return writeStdoutLine(output);
      return Effect.void;
    },

    // Machine data output
    document: () => Effect.succeed(false),
    result: () => Effect.succeed(false),
    resultStream: () => Effect.succeed(false),

    // Both modes
    json: (data) => writeStdoutLine(JSON.stringify(data, null, 2)),
    raw: (content) => writeStdout(content),
  });
};
