import * as p from "@clack/prompts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import { makeAppError } from "../app-error/index.js";
import {
  CliRenderer,
  type ColumnDef,
  type LogLevel,
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
// Clack stream method map
// ---------------------------------------------------------------------------

const streamMethodMap: Record<LogLevel, (iter: Iterable<string>) => Promise<void>> = {
  message: (iter) => p.stream.message(iter),
  info: (iter) => p.stream.info(iter),
  success: (iter) => p.stream.success(iter),
  step: (iter) => p.stream.step(iter),
  warn: (iter) => p.stream.warn(iter),
  error: (iter) => p.stream.error(iter),
};

// ---------------------------------------------------------------------------
// Clack handle wrappers
// ---------------------------------------------------------------------------

const makeSpinnerHandle = (s: p.SpinnerResult): SpinnerHandle => ({
  stop: (message) => Effect.sync(() => s.stop(message)),
  update: (message) => Effect.sync(() => s.message(message)),
  cancel: (message) => Effect.sync(() => s.cancel(message)),
  error: (message) => Effect.sync(() => s.error(message)),
  clear: () => Effect.sync(() => s.clear()),
});

const makeProgressHandle = (pr: p.ProgressResult): ProgressHandle => ({
  stop: (message) => Effect.sync(() => pr.stop(message)),
  update: (message) => Effect.sync(() => pr.message(message)),
  cancel: (message) => Effect.sync(() => pr.cancel(message)),
  error: (message) => Effect.sync(() => pr.error(message)),
  clear: () => Effect.sync(() => pr.clear()),
  advance: (step, message) => Effect.sync(() => pr.advance(step, message)),
});

const wrapGroupHandle = (
  group: ReturnType<ReturnType<typeof p.taskLog>["group"]>,
): TaskLogGroupHandle => ({
  message: (msg) => Effect.sync(() => group.message(msg)),
  error: (message) => Effect.sync(() => group.error(message)),
  success: (message) => Effect.sync(() => group.success(message)),
});

const wrapTaskLogHandle = (handle: ReturnType<typeof p.taskLog>): TaskLogHandle => ({
  message: (msg) => Effect.sync(() => handle.message(msg)),
  group: (name) => Effect.sync(() => wrapGroupHandle(handle.group(name))),
  error: (message) => Effect.sync(() => handle.error(message)),
  success: (message) => Effect.sync(() => handle.success(message)),
});

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

// ---------------------------------------------------------------------------
// Table formatter — Clack-styled with guide lines
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

const formatTable = <T>(
  items: ReadonlyArray<T>,
  columns: ReadonlyArray<ColumnDef<T>>,
  caption?: string,
): string => {
  if (items.length === 0 || columns.length === 0) return "";

  const termWidth = getTerminalWidth();
  const guidePrefix = "\u2502  "; // "│  "
  const guidePrefixWidth = 3;
  const colGap = 2;
  const availableWidth = termWidth - guidePrefixWidth;

  // Compute content widths
  const contentWidths: Array<number> = columns.map((col) => {
    let maxW = col.header.length;
    for (const item of items) {
      const val = col.value(item);
      if (val.length > maxW) maxW = val.length;
    }
    return maxW;
  });

  // Resolve column widths
  const colWidths: Array<number> = [];
  let usedWidth = 0;
  let fillCount = 0;

  for (let i = 0; i < columns.length; i++) {
    const col = columns[i]!;
    if (col.width === "fill") {
      fillCount++;
      colWidths.push(0); // placeholder
    } else if (typeof col.width === "number") {
      colWidths.push(col.width);
      usedWidth += col.width;
    } else {
      // "auto" — use content width
      const w = contentWidths[i]!;
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
      if (columns[i]!.width === "fill") {
        colWidths[i] = perFill;
      }
    }
  }

  const lines: Array<string> = [];

  // Caption
  if (caption) {
    lines.push(`\u2502  ${caption}`);
  }

  // Header row
  const headerCells = columns.map((col, i) =>
    pad(truncate(col.header, colWidths[i]!), colWidths[i]!, col.align),
  );
  lines.push(guidePrefix + headerCells.join(" ".repeat(colGap)));

  // Separator
  const sepCells = columns.map((_col, i) => "\u2500".repeat(colWidths[i]!));
  lines.push(guidePrefix + sepCells.join(" ".repeat(colGap)));

  // Data rows
  for (const item of items) {
    const cells = columns.map((col, i) => {
      const val = col.value(item);
      return pad(truncate(val, colWidths[i]!), colWidths[i]!, col.align);
    });
    lines.push(guidePrefix + cells.join(" ".repeat(colGap)));
  }

  return lines.join("\n");
};

// ---------------------------------------------------------------------------
// Detail formatter — vertical key-value
// ---------------------------------------------------------------------------

const formatDetail = <T>(
  item: T,
  columns: ReadonlyArray<ColumnDef<T>>,
  title?: string,
): string => {
  if (columns.length === 0) return "";

  const lines: Array<string> = [];
  const guidePrefix = "\u2502  "; // "│  "

  if (title) {
    lines.push(`\u2502  ${title}`);
  }

  // Find max label width for alignment
  const maxLabelWidth = Math.max(...columns.map((c) => c.header.length));

  for (const col of columns) {
    const label = pad(col.header, maxLabelWidth, "left");
    const value = col.value(item);
    lines.push(`${guidePrefix}${label}  ${value}`);
  }

  return lines.join("\n");
};

// ---------------------------------------------------------------------------
// Tree formatter — recursive with Clack-style connectors
// ---------------------------------------------------------------------------

const formatTree = <T>(
  roots: ReadonlyArray<TreeNode<T>>,
  def: TreeDef<T>,
  title?: string,
): string => {
  if (roots.length === 0) return "";

  const lines: Array<string> = [];
  const guidePrefix = "\u2502  "; // "│  "

  if (title) {
    lines.push(`${guidePrefix}${title}`);
  }

  const renderNode = (node: TreeNode<T>, prefix: string, isLast: boolean) => {
    const connector = isLast ? "\u2514\u2500 " : "\u251C\u2500 "; // "└─ " or "├─ "
    const icon = def.icon?.(node.data);
    const label = def.label(node.data);
    const detail = def.detail?.(node.data);

    let line = `${guidePrefix}${prefix}${connector}`;
    if (icon) line += `${icon} `;
    line += label;
    if (detail) line += `  ${detail}`;
    lines.push(line);

    const children = node.children ?? [];
    const childPrefix = prefix + (isLast ? "   " : "\u2502  "); // "│  "
    for (let i = 0; i < children.length; i++) {
      renderNode(children[i]!, childPrefix, i === children.length - 1);
    }
  };

  for (let i = 0; i < roots.length; i++) {
    renderNode(roots[i]!, "", i === roots.length - 1);
  }

  return lines.join("\n");
};

// ---------------------------------------------------------------------------
// InteractiveRenderer layer — Clack chrome on stderr, formatters on stdout
// ---------------------------------------------------------------------------

export const InteractiveRenderer = (): Layer.Layer<CliRenderer> => {
  const liveWithSpinner = <A, E, R>(
    message: string,
    f: (handle: SpinnerHandle) => Effect.Effect<A, E, R>,
    options?: SpinnerOptions<A>,
  ): Effect.Effect<A, E, R> =>
    Effect.suspend(() => {
      const s = p.spinner();
      s.start(message);
      const handle = makeSpinnerHandle(s);
      const successMessage =
        typeof options?.successMessage === "string"
          ? options.successMessage
          : undefined;
      const successMessageFn =
        typeof options?.successMessage === "function"
          ? options.successMessage
          : undefined;
      const failureMessage = options?.failureMessage;

      return Effect.interruptible(f(handle)).pipe(
        Effect.matchCauseEffect({
          onFailure: (cause) => {
            if (Cause.hasInterruptsOnly(cause)) {
              s.cancel();
            } else {
              s.error(failureMessage ?? message);
            }
            return Effect.failCause(cause);
          },
          onSuccess: (a) => {
            s.stop(successMessageFn?.(a) ?? successMessage ?? message);
            return Effect.succeed(a);
          },
        }),
        Effect.uninterruptible,
      );
    });

  return Layer.succeed(CliRenderer, {
    // Chrome (stderr) — delegate to Clack
    intro: (title) => Effect.sync(() => p.intro(title)),
    outro: (message) => Effect.sync(() => p.outro(message)),
    message: (message) => Effect.sync(() => p.log.message(message)),
    info: (message) => Effect.sync(() => p.log.info(message)),
    success: (message) => Effect.sync(() => p.log.success(message)),
    step: (message) => Effect.sync(() => p.log.step(message)),
    warn: (message) => Effect.sync(() => p.log.warn(message)),
    error: (message) => Effect.sync(() => p.log.error(message)),
    cancel: (message) => Effect.sync(() => p.cancel(message)),
    note: (message, title) => Effect.sync(() => p.note(message, title)),
    box: (message, title, opts) => Effect.sync(() => p.box(message, title, opts)),
    streamLog: <E, R>(level: LogLevel, stream: Stream.Stream<string, E, R>) =>
      Stream.runCollect(stream).pipe(
        Effect.flatMap((arr) =>
          Effect.tryPromise({
            try: () => streamMethodMap[level](arr),
            catch: (error) =>
              makeAppError({
                code: "STREAM_RENDER_FAILED",
                what: "Stream rendering failed",
                cause: error,
              }),
          }).pipe(Effect.orDie),
        ),
      ),

    // Activity — delegate to Clack
    spinner: (message) =>
      Effect.sync(() => {
        const s = p.spinner();
        s.start(message);
        return makeSpinnerHandle(s);
      }),
    withSpinner: liveWithSpinner,
    progress: (config, message) =>
      Effect.sync(() => {
        const pr = p.progress(config);
        pr.start(message);
        return makeProgressHandle(pr);
      }),
    withProgress: <A, E, R>(
      config: ProgressConfig,
      message: string,
      f: (handle: ProgressHandle) => Effect.Effect<A, E, R>,
      stopMessage?: string,
    ): Effect.Effect<A, E, R> =>
      Effect.suspend(() => {
        const pr = p.progress(config);
        pr.start(message);
        const handle = makeProgressHandle(pr);

        return Effect.interruptible(f(handle)).pipe(
          Effect.matchCauseEffect({
            onFailure: (cause) => {
              if (Cause.hasInterruptsOnly(cause)) {
                pr.cancel();
              } else {
                pr.error(message);
              }
              return Effect.failCause(cause);
            },
            onSuccess: (a) => {
              pr.stop(stopMessage ?? message);
              return Effect.succeed(a);
            },
          }),
          Effect.uninterruptible,
        );
      }),
    taskLog: (config) => Effect.sync(() => wrapTaskLogHandle(p.taskLog(config))),
    withTaskLog: <A, E, R>(
      config: TaskLogConfig,
      f: (handle: TaskLogHandle) => Effect.Effect<A, E, R>,
    ): Effect.Effect<A, E, R> =>
      Effect.suspend(() => {
        const handle = wrapTaskLogHandle(p.taskLog(config));
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
          liveWithSpinner(task.title, (handle) =>
            Effect.map(
              task.task((msg) => handle.update(msg)),
              (result) => result ?? task.title,
            ),
          ),
        { concurrency: 1 },
      ),

    // Data display (stdout) — custom formatters
    table: <T>(
      items: ReadonlyArray<T>,
      columns: ReadonlyArray<ColumnDef<T>>,
      caption?: string,
    ) => {
      const output = formatTable(items, columns, caption);
      if (output) return writeStdoutLine(output);
      return Effect.void;
    },
    detail: <T>(
      item: T,
      columns: ReadonlyArray<ColumnDef<T>>,
      title?: string,
    ) => {
      const output = formatDetail(item, columns, title);
      if (output) return writeStdoutLine(output);
      return Effect.void;
    },
    tree: <T>(
      roots: ReadonlyArray<TreeNode<T>>,
      def: TreeDef<T>,
      title?: string,
    ) => {
      const output = formatTree(roots, def, title);
      if (output) return writeStdoutLine(output);
      return Effect.void;
    },

    // Machine data output — no-ops in interactive mode
    result: () => Effect.succeed(false),
    resultStream: () => Effect.succeed(false),

    // Both modes (stdout)
    json: (data) => writeStdoutLine(JSON.stringify(data, null, 2)),
    raw: (content) => writeStdout(content),
  });
};
