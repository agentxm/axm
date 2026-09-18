import type { Doc } from "../../screen/doc.js";
import { paintText, unicodeGlyphs, type Glyphs, type PaintStyle } from "../../screen/paint-text.js";
import {
  liveColumns,
  liveRows,
  paintLivePart,
  paintScene,
  type Scene,
  type TerminalSize,
} from "../../screen/scene.js";

/** A settled document: printed once to the transcript and bounded by width only. */
export interface DocumentFixture {
  readonly _tag: "document";
  readonly name: string;
  readonly doc: Doc;
  /** Widths this fixture is snapshot at, when its mock names its own. */
  readonly widths?: ReadonlyArray<number>;
  /** The glyph set the snapshot is painted with, when its mock draws its own. */
  readonly glyphs?: Glyphs;
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

/**
 * A whole live scene — a ledger and the interaction beneath it — painted by
 * the live region's own rules for sharing the height between them.
 */
export interface ComposedFixture {
  readonly _tag: "composed";
  readonly name: string;
  readonly scene: Scene;
  /** Widths this fixture is snapshot at, when its mock names its own. */
  readonly widths?: ReadonlyArray<number>;
}

export type GalleryFixture = DocumentFixture | SceneFixture | ComposedFixture;

/**
 * Paint a fixture as the terminal would show it. A settled document fills the
 * terminal width; a live scene goes through the live region's own rules, so a
 * snapshot shows what the frame would paint.
 */
export const paintFixture = (
  fixture: GalleryFixture,
  terminal: TerminalSize,
  style: Omit<PaintStyle, "width">,
): ReadonlyArray<string> => {
  switch (fixture._tag) {
    case "document":
      return paintText(fixture.doc, {
        ...style,
        ...(fixture.glyphs === undefined ? {} : { glyphs: fixture.glyphs }),
        width: terminal.columns,
      });
    case "scene":
      return paintLivePart(
        fixture.scene(terminal),
        { columns: liveColumns(terminal.columns), rows: liveRows(terminal.rows) },
        style,
      );
    case "composed":
      return paintScene(fixture.scene, terminal, {
        ...style,
        // A still snapshot paints the running mark's first frame.
        spinner: (style.glyphs ?? unicodeGlyphs).spinner[0] ?? "",
        nowMs: 0,
      });
  }
};
