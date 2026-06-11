import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

import {
  type BoxOptions,
  type LogLevel,
  type ProgressConfig,
  type ProgressHandle,
  type SpinnerHandle,
  type TaskLogConfig,
  type TaskLogGroupHandle,
  type TaskLogHandle,
} from "./cli-renderer.js";
import { annotate, indentedMessage, repeat, writeStderrLine } from "./renderer-helpers.js";

const ESC = "\u001b[";
export const ANSI_RESET = `${ESC}0m`;
export const ANSI_BOLD = `${ESC}1m`;
export const ANSI_DIM = `${ESC}2m`;
export const ANSI_RED = `${ESC}31m`;
export const ANSI_GREEN = `${ESC}32m`;
export const ANSI_YELLOW = `${ESC}33m`;
export const ANSI_CYAN = `${ESC}36m`;
const ANSI_CURSOR_SHOW = `${ESC}?25h`;
const ANSI_CURSOR_HIDE = `${ESC}?25l`;
const ANSI_CURSOR_LEFT = `${ESC}G`;
const ANSI_ERASE_LINE = `${ESC}2K`;
const ERASE_CURRENT_LINE = `${ANSI_CURSOR_LEFT}${ANSI_ERASE_LINE}`;
const SPINNER_INTERVAL_MS = 80;
const DEFAULT_TERMINAL_WIDTH = 80;
const MIN_PROGRESS_BAR_WIDTH = 10;
const MAX_PROGRESS_BAR_WIDTH = 40;

/**
 * Canonical CLI status glyph vocabulary.
 *
 * Log levels own glyph rendering. Call sites should pass plain text to the
 * renderer and must not prefix messages with status glyphs.
 */
export const Symbols = {
  intro: "◇",
  outro: "◇",
  message: "○",
  info: "●",
  success: "✔",
  step: "◆",
  warn: "▲",
  error: "✖",
  cancel: "■",
  spinner: ["◒", "◐", "◓", "◑"],
} as const;

const levelStyles: Record<LogLevel, ReadonlyArray<string>> = {
  message: [ANSI_DIM],
  info: [ANSI_CYAN],
  success: [ANSI_GREEN],
  step: [ANSI_CYAN],
  warn: [ANSI_YELLOW],
  error: [ANSI_RED],
};

const introStyles = [ANSI_BOLD, ANSI_CYAN];
const outroStyles = [ANSI_GREEN];
const cancelStyles = [ANSI_RED];

const progressChars = (
  style: ProgressConfig["style"],
): {
  readonly filled: string;
  readonly empty: string;
} => {
  if (style === "light") {
    return { filled: "=", empty: "-" };
  }
  if (style === "heavy") {
    return { filled: "■", empty: "□" };
  }
  return { filled: "█", empty: "░" };
};

const writePlainLine = (message: string, styles: ReadonlyArray<string> = []) =>
  writeStderrLine(styles.length === 0 ? message : annotate(message, styles));

const getTerminalWidth = (): number =>
  process.stderr.columns ?? process.stdout.columns ?? DEFAULT_TERMINAL_WIDTH;

const alignText = (text: string, width: number, alignment: "left" | "center" | "right"): string => {
  if (text.length >= width) {
    return text;
  }

  const remaining = width - text.length;
  if (alignment === "right") {
    return `${" ".repeat(remaining)}${text}`;
  }
  if (alignment === "center") {
    const left = Math.floor(remaining / 2);
    return `${" ".repeat(left)}${text}${" ".repeat(remaining - left)}`;
  }
  return `${text}${" ".repeat(remaining)}`;
};

const splitLines = (message: string): Array<string> => message.split("\n");

const rule = (width: number, title?: string): string => {
  const safeWidth = Math.max(width, 1);
  if (title === undefined || title.length === 0) {
    return repeat("─", safeWidth);
  }

  const label = ` ${title} `;
  if (label.length >= safeWidth) {
    return label;
  }

  return `${label}${repeat("─", safeWidth - label.length)}`;
};

const styledSymbol = (symbol: string, styles: ReadonlyArray<string>): string =>
  annotate(symbol, styles);

export const styledLine = (
  symbol: string,
  styles: ReadonlyArray<string>,
  message: string,
): string => `${styledSymbol(symbol, styles)}  ${message}`;

const writeStyledLine = (symbol: string, styles: ReadonlyArray<string>, message: string) =>
  writeStderrLine(styledLine(symbol, styles, message));

export const logLine = (level: LogLevel, message: string) =>
  level === "message"
    ? writePlainLine(message)
    : writeStyledLine(Symbols[level], levelStyles[level], message);

export const intro = (title: string) => writeStyledLine(Symbols.intro, introStyles, title);

export const outro = (message: string) => writeStyledLine(Symbols.outro, outroStyles, message);

export const cancel = (message: string) => writeStyledLine(Symbols.cancel, cancelStyles, message);

const renderNote = (message: string, title?: string): string => {
  const lines = splitLines(message);
  const width = Math.max(1, title?.length ?? 0, ...lines.map((line) => line.length));

  return [rule(width, title), ...lines, repeat("─", width)].join("\n");
};

const makeBorder = (
  left: string,
  right: string,
  width: number,
  title?: string,
  alignment: "left" | "center" | "right" = "center",
): string => {
  if (title === undefined || title.length === 0) {
    return `${left}${repeat("─", width)}${right}`;
  }

  const label = ` ${title} `;
  const remaining = Math.max(width - label.length, 0);
  const offset =
    alignment === "center" ? Math.floor(remaining / 2) : alignment === "right" ? remaining : 0;

  return `${left}${repeat("─", offset)}${label}${repeat("─", remaining - offset)}${right}`;
};

const renderBox = (message: string, title?: string, opts?: BoxOptions): string => {
  const padding = opts?.padding ?? 1;
  const lines = splitLines(message);
  const contentWidth = Math.max(1, ...lines.map((line) => line.length));
  const innerWidth = Math.max(
    opts?.width ?? 0,
    contentWidth + padding * 2,
    (title?.length ?? 0) + 2,
  );
  const availableWidth = Math.max(innerWidth - padding * 2, 1);
  const contentAlignment = opts?.contentAlignment ?? "left";
  const titleAlignment = opts?.titleAlignment ?? "center";
  const chars =
    opts?.rounded === true
      ? { topLeft: "╭", topRight: "╮", bottomLeft: "╰", bottomRight: "╯", vertical: "│" }
      : { topLeft: "┌", topRight: "┐", bottomLeft: "└", bottomRight: "┘", vertical: "│" };

  const emptyLine = `${chars.vertical}${" ".repeat(innerWidth)}${chars.vertical}`;
  const contentLines = lines.map((line) => {
    const aligned = alignText(line, availableWidth, contentAlignment);
    return `${chars.vertical}${" ".repeat(padding)}${aligned}${" ".repeat(padding)}${chars.vertical}`;
  });

  return [
    makeBorder(chars.topLeft, chars.topRight, innerWidth, title, titleAlignment),
    ...Array.from({ length: padding }, () => emptyLine),
    ...contentLines,
    ...Array.from({ length: padding }, () => emptyLine),
    `${chars.bottomLeft}${repeat("─", innerWidth)}${chars.bottomRight}`,
  ].join("\n");
};

export const note = (message: string, title?: string) =>
  writeStderrLine(renderNote(message, title));

export const box = (message: string, title?: string, opts?: BoxOptions) =>
  writeStderrLine(renderBox(message, title, opts));

type SpinnerState = {
  closed: boolean;
  frame: number;
  interval: ReturnType<typeof setInterval>;
  message: string;
};

const releaseSpinner = (state: SpinnerState, eraseLine: boolean) => {
  if (!state.closed) {
    state.closed = true;
    clearInterval(state.interval);
    process.stderr.write(`${eraseLine ? ERASE_CURRENT_LINE : ""}${ANSI_CURSOR_SHOW}`);
  }
};

const clearSpinner = (state: SpinnerState) => {
  releaseSpinner(state, true);
};

const settleSpinner = (
  state: SpinnerState,
  symbol: string,
  styles: ReadonlyArray<string>,
  fallback: string,
  newline: boolean,
) =>
  Effect.sync(() => {
    if (state.closed) {
      return;
    }

    state.closed = true;
    clearInterval(state.interval);
    const message = fallback.length > 0 ? fallback : state.message;
    const line =
      styles.length === 0 ? `${symbol}  ${message}` : styledLine(symbol, styles, message);
    process.stderr.write(`${ERASE_CURRENT_LINE}${line}${ANSI_CURSOR_SHOW}${newline ? "\n" : ""}`);
  });

const renderSpinnerFrame = (state: SpinnerState) => {
  const symbol = Symbols.spinner[state.frame % Symbols.spinner.length] ?? Symbols.spinner[0];
  process.stderr.write(`${ANSI_CURSOR_HIDE}${ERASE_CURRENT_LINE}${symbol}  ${state.message}`);
};

const makeSpinnerState = (message: string) =>
  Effect.gen(function* () {
    const scope = yield* Scope.make();
    const state = yield* Scope.provide(scope)(
      Effect.acquireRelease(
        Effect.sync(() => {
          const state: SpinnerState = {
            closed: false,
            frame: 0,
            interval: setInterval(() => undefined, SPINNER_INTERVAL_MS),
            message,
          };

          clearInterval(state.interval);
          state.interval = setInterval(() => {
            if (!state.closed) {
              state.frame = (state.frame + 1) % Symbols.spinner.length;
              renderSpinnerFrame(state);
            }
          }, SPINNER_INTERVAL_MS);

          renderSpinnerFrame(state);
          return state;
        }),
        (state) =>
          Effect.sync(() => {
            clearSpinner(state);
          }),
      ),
    );

    return {
      state,
      close: Scope.close(scope, Exit.void),
    };
  });

export const spinner = (message: string): Effect.Effect<SpinnerHandle> =>
  makeSpinnerState(message).pipe(
    Effect.map(({ state, close }) => {
      const settle = (symbol: string, styles: ReadonlyArray<string>, nextMessage?: string) =>
        settleSpinner(state, symbol, styles, nextMessage ?? state.message, true).pipe(
          Effect.andThen(close),
        );

      return {
        stop: (nextMessage) => settle(Symbols.success, levelStyles.success, nextMessage),
        update: (nextMessage) =>
          Effect.sync(() => {
            if (state.closed) {
              return;
            }
            state.message = nextMessage ?? state.message;
            renderSpinnerFrame(state);
          }),
        cancel: (nextMessage) => settle(Symbols.cancel, cancelStyles, nextMessage),
        error: (nextMessage) => settle(Symbols.error, levelStyles.error, nextMessage),
        clear: () => close,
      } satisfies SpinnerHandle;
    }),
  );

type ProgressState = {
  closed: boolean;
  current: number;
  max: number;
  message: string;
  style: ProgressConfig["style"];
  size: number | undefined;
};

const barWidthFor = (state: ProgressState): number => {
  if (typeof state.size === "number") {
    return Math.max(state.size, MIN_PROGRESS_BAR_WIDTH);
  }

  const reserved = state.message.length + 12;
  return Math.max(
    MIN_PROGRESS_BAR_WIDTH,
    Math.min(MAX_PROGRESS_BAR_WIDTH, getTerminalWidth() - reserved),
  );
};

const progressLine = (state: ProgressState): string => {
  const percent = Math.round((state.current / state.max) * 100);
  const width = barWidthFor(state);
  const chars = progressChars(state.style);
  const filled = Math.round((percent / 100) * width);
  const empty = Math.max(width - filled, 0);
  return `${Symbols.spinner[0]}  [${repeat(chars.filled, filled)}${repeat(chars.empty, empty)}] ${percent}% ${state.message}`.trimEnd();
};

const settleProgress = (
  state: ProgressState,
  symbol: string,
  styles: ReadonlyArray<string>,
  message: string,
  newline: boolean,
) =>
  Effect.sync(() => {
    if (state.closed) {
      return;
    }

    state.closed = true;
    const line =
      styles.length === 0 ? `${symbol}  ${message}` : styledLine(symbol, styles, message);
    process.stderr.write(`${ERASE_CURRENT_LINE}${line}${newline ? "\n" : ""}`);
  });

export const progress = (config: ProgressConfig, message?: string): Effect.Effect<ProgressHandle> =>
  Effect.sync(() => {
    const state: ProgressState = {
      closed: false,
      current: 0,
      max: Math.max(config.max ?? 100, 1),
      message: message ?? "",
      style: config.style,
      size: config.size,
    };

    process.stderr.write(progressLine(state));

    return {
      stop: (nextMessage) =>
        settleProgress(
          state,
          Symbols.success,
          levelStyles.success,
          nextMessage ?? state.message,
          true,
        ),
      update: (nextMessage) =>
        Effect.sync(() => {
          if (state.closed) {
            return;
          }
          state.message = nextMessage ?? state.message;
          process.stderr.write(`${ERASE_CURRENT_LINE}${progressLine(state)}`);
        }),
      cancel: (nextMessage) =>
        settleProgress(state, Symbols.cancel, cancelStyles, nextMessage ?? state.message, true),
      error: (nextMessage) =>
        settleProgress(state, Symbols.error, levelStyles.error, nextMessage ?? state.message, true),
      clear: () =>
        Effect.sync(() => {
          if (!state.closed) {
            state.closed = true;
            process.stderr.write(ERASE_CURRENT_LINE);
          }
        }),
      advance: (step, nextMessage) =>
        Effect.sync(() => {
          if (state.closed) {
            return;
          }
          state.current = Math.min(state.current + (step ?? 1), state.max);
          state.message = nextMessage ?? state.message;
          process.stderr.write(`${ERASE_CURRENT_LINE}${progressLine(state)}`);
        }),
    } satisfies ProgressHandle;
  });

const groupedHandle = (depth: number): TaskLogGroupHandle => ({
  message: (message) => writeStderrLine(indentedMessage(depth, message)),
  error: (message) =>
    writeStderrLine(indentedMessage(depth, styledLine(Symbols.error, levelStyles.error, message))),
  success: (message) =>
    writeStderrLine(
      indentedMessage(depth, styledLine(Symbols.success, levelStyles.success, message)),
    ),
});

export const taskLog = (config: TaskLogConfig): Effect.Effect<TaskLogHandle> =>
  writeStyledLine(Symbols.step, levelStyles.step, config.title).pipe(
    Effect.as({
      message: (message: string) => writeStderrLine(indentedMessage(2, message)),
      group: (name: string) =>
        writeStyledLine(Symbols.step, levelStyles.step, name).pipe(Effect.as(groupedHandle(4))),
      error: (message: string) =>
        writeStderrLine(indentedMessage(2, styledLine(Symbols.error, levelStyles.error, message))),
      success: (message: string) =>
        writeStderrLine(
          indentedMessage(2, styledLine(Symbols.success, levelStyles.success, message)),
        ),
    } satisfies TaskLogHandle),
  );

export const streamLog = <E, R>(level: LogLevel, stream: Stream.Stream<string, E, R>) =>
  Stream.runCollect(stream).pipe(
    Effect.flatMap((chunks) => logLine(level, Array.from(chunks).join(""))),
  );
