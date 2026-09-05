/**
 * Progress view — the phrase layer for the live frame.
 *
 * Projects `ProgressState` into typed documents: the live region the frame
 * repaints, the transcript transitions plain mode writes, and the collapse
 * line every mode writes when an operation settles. All wording lives here,
 * beside the painter; the frame paints documents and never formats events.
 */

import type { Doc, Span, Text } from "./doc.js";
import type { Glyphs } from "./paint-text.js";
import { paintInline, unicodeGlyphs } from "./paint-text.js";
import {
  blockingClass,
  bytes,
  duration,
  phaseLabel,
  settledOutcomeTone,
  unitState,
} from "./phrases.js";
import {
  operationElapsedMs,
  plannedProgress,
  runningTasks,
  type ProgressMeasure,
  type ProgressState,
  type ProgressTask,
} from "./progress.js";
import { displayWidth, truncateDisplay } from "./width.js";

export interface LiveProgressOptions {
  /** Columns available to one live line; longer labels are truncated. */
  readonly width: number;
  /** ANSI styling for the live region. */
  readonly colors: boolean;
  /** Current spinner glyph for running lines. */
  readonly spinner: string;
  readonly glyphs?: Glyphs;
  /** Wall clock for elapsed time on the operation line. */
  readonly nowMs?: number;
}

const measureText = (measure: ProgressMeasure): string => {
  switch (measure.unit) {
    case "bytes":
      return measure.total === undefined
        ? bytes(measure.done)
        : `${bytes(measure.done)} / ${bytes(measure.total)}`;
    case "files":
    case "items":
      return measure.total === undefined
        ? `${String(measure.done)} ${measure.unit}`
        : `${String(measure.done)}/${String(measure.total)} ${measure.unit}`;
  }
};

const spans = (...parts: ReadonlyArray<Span | undefined>): ReadonlyArray<Span> =>
  parts.filter((part): part is Span => part !== undefined && part.text.length > 0);

/** Fit a label between a fixed prefix and suffix so the line never exceeds the width. */
const fit = (label: string, width: number, fixed: ReadonlyArray<Span | undefined>): string => {
  const reserved = fixed.reduce(
    (sum, span) => sum + (span === undefined ? 0 : displayWidth(span.text)),
    0,
  );
  return truncateDisplay(label, Math.max(4, width - reserved));
};

const paintLine = (text: ReadonlyArray<Span>, options: LiveProgressOptions): string =>
  paintInline(text, {
    width: options.width,
    colors: options.colors,
    ...(options.glyphs === undefined ? {} : { glyphs: options.glyphs }),
  });

const operationLine = (
  state: ProgressState,
  options: LiveProgressOptions,
): ReadonlyArray<string> => {
  const operation = state.operation;
  if (operation === undefined) return [];
  const phase = state.phase === undefined ? undefined : phaseLabel(state.phase);
  const counts = plannedProgress(state);
  const elapsed = operationElapsedMs(state, options.nowMs);
  const prefix: Span = { text: `${options.spinner} ` };
  const phaseSpan: Span | undefined = phase === undefined ? undefined : { text: ` — ${phase}` };
  const countsSpan: Span | undefined =
    counts === undefined
      ? undefined
      : { text: ` (${String(counts.settled)}/${String(counts.total)})`, tone: "dim" };
  const elapsedSpan: Span | undefined =
    elapsed === undefined || elapsed < 1_000
      ? undefined
      : { text: ` · ${duration(elapsed)}`, tone: "dim" };
  const fixed = [prefix, phaseSpan, countsSpan, elapsedSpan];
  return [
    paintLine(
      spans(
        prefix,
        { text: fit(operation.name, options.width, fixed), bold: true },
        phaseSpan,
        countsSpan,
        elapsedSpan,
      ),
      options,
    ),
  ];
};

const taskDepth = (task: ProgressTask, tasks: ReadonlyArray<ProgressTask>): number => {
  let depth = 1;
  let current = task;
  while (current.parentId !== undefined) {
    const parent = tasks.find((candidate) => candidate.id === current.parentId);
    if (parent === undefined) break;
    depth += 1;
    current = parent;
  }
  return depth;
};

const taskLine = (
  task: ProgressTask,
  state: ProgressState,
  options: LiveProgressOptions,
): string => {
  const indent: Span = { text: `${"  ".repeat(taskDepth(task, state.tasks))}${options.spinner} ` };
  const measure: Span | undefined =
    task.measure === undefined
      ? undefined
      : { text: `  ${measureText(task.measure)}`, tone: "dim" };
  const fixed = [indent, measure];
  return paintLine(
    spans(indent, { text: fit(task.label, options.width, fixed) }, measure),
    options,
  );
};

const waitingLines = (state: ProgressState, options: LiveProgressOptions): ReadonlyArray<string> =>
  state.waiting.map((wait) => {
    const glyphs = options.glyphs ?? unicodeGlyphs;
    const prefix: Span = { text: `${glyphs.status.warn} Waiting — `, tone: "warn" };
    const detail: Span | undefined =
      wait.detail.length === 0 ? undefined : { text: `: ${wait.detail}`, tone: "dim" };
    const reason = blockingClass(wait.blockingClass);
    const fixed = [prefix, detail];
    return paintLine(
      spans(prefix, { text: fit(reason, options.width, fixed), tone: "warn" }, detail),
      options,
    );
  });

/**
 * The live region for an unsettled operation, painted line by line: the
 * operation line, one line per running unit (nested under its parent), and
 * any open wait. Empty once the operation settled or before it started. Lines
 * are laid out here, never wrapped, so every line fits the width.
 */
export const liveProgressLines = (
  state: ProgressState,
  options: LiveProgressOptions,
): ReadonlyArray<string> => {
  if (state.settled !== undefined) return [];
  return [
    ...operationLine(state, options),
    ...runningTasks(state).map((task) => taskLine(task, state, options)),
    ...waitingLines(state, options),
  ];
};

const settledLine = (state: ProgressState): Doc => {
  if (state.settled === undefined) return [];
  const name = state.operation?.name;
  if (name === undefined) return [];
  const elapsed = operationElapsedMs(state);
  const failedUnits = state.tasks.filter(
    (task) => task.status === "failed" || task.status === "interrupted",
  );
  const aside: Text | undefined =
    elapsed === undefined
      ? undefined
      : failedUnits.length === 0
        ? duration(elapsed)
        : `${duration(elapsed)} · ${String(failedUnits.length)} ${unitState(failedUnits[0]?.status === "interrupted" ? "interrupted" : "failed")}`;
  return [
    {
      _tag: "headline",
      tone: settledOutcomeTone(state.settled.outcome),
      text: name,
      ...(aside === undefined ? {} : { aside }),
    },
  ];
};

export interface ProgressTransitionOptions {
  /**
   * Whether a live region shows intermediate state. When it does, only the
   * settlement reaches the transcript; otherwise the transcript also carries
   * the operation start, restoration, and waits.
   */
  readonly live: boolean;
}

/**
 * Transcript lines a state transition produces. Plain mode narrates start,
 * restoration, waits, and settlement; live mode collapses to the settlement
 * line because the live region already showed the rest.
 */
export const progressTransitionDoc = (
  previous: ProgressState | undefined,
  next: ProgressState,
  options: ProgressTransitionOptions,
): Doc => {
  const settledNow = next.settled !== undefined && previous?.settled === undefined;
  if (options.live) return settledNow ? settledLine(next) : [];
  const doc: Array<Doc[number]> = [];
  if (next.operation !== undefined && previous?.operation === undefined) {
    doc.push({ _tag: "headline", tone: "info", text: next.operation.name });
  }
  if (next.phase === "restoration" && previous?.phase !== "restoration") {
    doc.push({
      _tag: "headline",
      tone: "warn",
      text: `Rolling back ${next.operation?.name ?? "changes"}`,
    });
  }
  for (const wait of next.waiting) {
    if (previous?.waiting.some((known) => known.subject === wait.subject) === true) continue;
    doc.push({
      _tag: "headline",
      tone: "warn",
      text: `Waiting — ${blockingClass(wait.blockingClass)}${wait.detail.length === 0 ? "" : `: ${wait.detail}`}`,
    });
  }
  if (settledNow) doc.push(...settledLine(next));
  return doc;
};
