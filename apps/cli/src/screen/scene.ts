/** Bounded layout for the current activity or foreground interaction. */

import type { Doc } from "./doc.js";
import { paintText, type PaintStyle } from "./paint-text.js";
import { unicodeGlyphs } from "./glyphs.js";
import { truncateLine } from "./width.js";

/** The terminal a live scene is laid out against. */
export interface TerminalSize {
  readonly columns: number;
  readonly rows: number;
}

/** Rows the live region leaves free beneath itself. */
const RESERVED_ROWS = 2;

/**
 * Columns one live line may use. A repainting line that reaches the last
 * column wraps, and a wrapped line breaks the row count the region erases by,
 * so the region stops one column short of the terminal.
 */
export const liveColumns = (columns: number): number => Math.max(1, columns - 1);

/** Rows the whole live region may use: the terminal height less the rows it leaves free. */
export const liveRows = (rows: number): number => Math.max(0, rows - RESERVED_ROWS);

/** The space a scene part lays itself out in, and the animation it paints against. */
export interface SceneFacts {
  /** Columns the part may use — already one short of the terminal width. */
  readonly columns: number;
  /** Rows the part may use. */
  readonly rows: number;
  /** The region's current spinner frame, so a running row animates with it. */
  readonly spinner: string;
  /** Wall clock for elapsed and remaining times. */
  readonly nowMs: number;
}

/** One part of the scene: a pure function of the space it is given to a document. */
export type ScenePart = (facts: SceneFacts) => Doc;

/** The live region's content. Either part may be absent; both absent clears the region. */
export interface Scene {
  readonly activity?: ScenePart | undefined;
  readonly interaction?: ScenePart | undefined;
}

interface SceneStyle extends Omit<PaintStyle, "width"> {
  readonly spinner: string;
  readonly nowMs: number;
}

/** Paint a document into the space a live part was given, cutting what does not fit. */
export const paintLivePart = (
  doc: Doc,
  space: { readonly columns: number; readonly rows: number },
  style: Omit<PaintStyle, "width">,
): ReadonlyArray<string> =>
  space.rows <= 0
    ? []
    : paintText(doc, { ...style, width: space.columns, wrap: false })
        .slice(0, space.rows)
        .map((line) => truncateLine(line, space.columns, (style.glyphs ?? unicodeGlyphs).ellipsis));

/** An interaction takes the foreground; completed work has no height budget. */
export const paintScene = (
  scene: Scene,
  terminal: TerminalSize,
  style: SceneStyle,
): ReadonlyArray<string> => {
  const part = scene.interaction ?? scene.activity;
  const space = { columns: liveColumns(terminal.columns), rows: liveRows(terminal.rows) };
  return part === undefined
    ? []
    : paintLivePart(part({ ...space, spinner: style.spinner, nowMs: style.nowMs }), space, style);
};
