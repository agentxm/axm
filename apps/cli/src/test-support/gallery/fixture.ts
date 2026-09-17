import type { Doc } from "../../screen/doc.js";
import { paintText, type PaintStyle } from "../../screen/paint-text.js";
import { liveColumns, liveRows, paintLivePart, type TerminalSize } from "../../screen/scene.js";

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
 * terminal width; a live scene goes through the live region's own rules, so a
 * snapshot shows what the frame would paint.
 */
export const paintFixture = (
  fixture: GalleryFixture,
  terminal: TerminalSize,
  style: Omit<PaintStyle, "width">,
): ReadonlyArray<string> =>
  fixture._tag === "document"
    ? paintText(fixture.doc, { ...style, width: terminal.columns })
    : paintLivePart(
        fixture.scene(terminal),
        { columns: liveColumns(terminal.columns), rows: liveRows(terminal.rows) },
        style,
      );
