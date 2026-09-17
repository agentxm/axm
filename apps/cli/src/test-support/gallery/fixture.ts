import type { Doc } from "../../screen/doc.js";
import { paintText, type PaintStyle } from "../../screen/paint-text.js";

/** The terminal facts a live scene is laid out against. */
export interface TerminalSize {
  readonly columns: number;
  readonly rows: number;
}

/** A settled document: printed once to the transcript and bounded by width only. */
export interface DocumentFixture {
  readonly _tag: "document";
  readonly name: string;
  readonly doc: Doc;
  /** Widths this fixture is snapshot at, when its mock names its own. */
  readonly widths?: ReadonlyArray<number>;
}

/**
 * A live scene: the document the live region shows for one bound state, as a
 * pure function of the terminal size. It is bounded by width and height.
 */
export interface SceneFixture {
  readonly _tag: "scene";
  readonly name: string;
  readonly scene: (terminal: TerminalSize) => Doc;
  /** Widths this fixture is snapshot at, when its mock names its own. */
  readonly widths?: ReadonlyArray<number>;
}

export type GalleryFixture = DocumentFixture | SceneFixture;

/**
 * Paint a fixture as the terminal would show it. A settled document fills the
 * terminal width; a live scene stops one column short, because a repainting
 * line that reaches the last column wraps and miscounts the region.
 */
export const paintFixture = (
  fixture: GalleryFixture,
  terminal: TerminalSize,
  style: Omit<PaintStyle, "width">,
): ReadonlyArray<string> =>
  fixture._tag === "document"
    ? paintText(fixture.doc, { ...style, width: terminal.columns })
    : paintText(fixture.scene(terminal), { ...style, width: terminal.columns - 1 });
