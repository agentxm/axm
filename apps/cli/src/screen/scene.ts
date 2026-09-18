/**
 * The live scene — what the live region shows, and the space it is given.
 *
 * The region shows one scene: the operation's ledger with at most one
 * interaction — a prompt or a wait — beneath it. Each part is a pure function
 * of the space it is given to a typed document, painted by the one painter.
 * This module owns the two mechanical guarantees the design rests on: no live
 * line wraps, and the whole scene fits the terminal height. Neither depends on
 * a part laying itself out well, so a part that asks for more than it was
 * given is cut at what it was given.
 */

import type { Doc } from "./doc.js";
import { paintText, unicodeGlyphs, type PaintStyle } from "./paint-text.js";
import { truncateLine } from "./width.js";

/** The terminal a live scene is laid out against. */
export interface TerminalSize {
  readonly columns: number;
  readonly rows: number;
}

/** Rows the live region leaves free beneath itself. */
const RESERVED_ROWS = 2;

/** The interaction's minimum: its question, three rows, and a hint. */
const INTERACTION_MIN_ROWS = 5;

/** The ledger window's minimum: its header and its fold line. */
export const LEDGER_MIN_ROWS = 6;

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
  readonly ledger?: ScenePart | undefined;
  readonly interaction?: ScenePart | undefined;
}

export interface SceneStyle extends Omit<PaintStyle, "width"> {
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

/**
 * Paint the whole scene for one terminal: the ledger, then the interaction
 * beneath it. When the two compete for height the interaction keeps its
 * minimum and the ledger window shrinks to its header and fold line; the
 * ledger takes whatever the interaction leaves.
 */
export const paintScene = (
  scene: Scene,
  terminal: TerminalSize,
  style: SceneStyle,
): ReadonlyArray<string> => {
  const columns = liveColumns(terminal.columns);
  const budget = liveRows(terminal.rows);
  if (budget === 0) return [];
  const paintStyle: Omit<PaintStyle, "width"> = {
    colors: style.colors,
    spinner: style.spinner,
    ...(style.glyphs === undefined ? {} : { glyphs: style.glyphs }),
  };
  const part = (produce: ScenePart | undefined, rows: number): ReadonlyArray<string> =>
    produce === undefined || rows <= 0
      ? []
      : paintLivePart(
          produce({ columns, rows, spinner: style.spinner, nowMs: style.nowMs }),
          { columns, rows },
          paintStyle,
        );

  const asked = part(scene.interaction, budget);
  const interaction =
    scene.ledger === undefined || budget - asked.length >= LEDGER_MIN_ROWS
      ? asked
      : part(
          scene.interaction,
          Math.min(budget, Math.max(INTERACTION_MIN_ROWS, budget - LEDGER_MIN_ROWS)),
        );
  return [...part(scene.ledger, budget - interaction.length), ...interaction];
};
