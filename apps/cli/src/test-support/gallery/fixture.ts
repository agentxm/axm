import type { Doc } from "../../screen/doc.js";
import { paintText, type PaintStyle } from "../../screen/paint-text.js";
import { unicodeGlyphs, type Glyphs } from "../../screen/glyphs.js";
import {
  liveColumns,
  liveRows,
  paintLivePart,
  paintScene,
  type Scene,
  type TerminalSize,
} from "../../screen/scene.js";

/**
 * The widths every fixture is checked at: it fits, leaves no trailing
 * whitespace, and never cuts a copyable value at each of them, whether or not
 * it is snapshot there.
 */
export const galleryWidths: ReadonlyArray<number> = [40, 80, 120, 200];

/**
 * The widths a settled document is snapshot at unless it declares its own.
 * Most documents paint the same at 200 columns as at 120, so a fixture keeps a
 * 200-column snapshot only when its painting there differs and it says so.
 */
const documentSnapshotWidths: ReadonlyArray<number> = [40, 80, 120];

/**
 * The widths the stress frames are held at. They add the hundred columns a
 * working terminal actually has, which is where a ledger first has to choose
 * between the information it carries and the columns it lays out.
 */
export const stressWidths: ReadonlyArray<number> = [40, 80, 100, 120, 200];

/** Terminal heights a live scene must fit; settled documents are not height-bound. */
const galleryHeights: ReadonlyArray<number> = [16, 24];

/** A settled document: printed once to the transcript and bounded by width only. */
interface DocumentFixture {
  readonly _tag: "document";
  readonly name: string;
  readonly doc: Doc;
  /** Widths this fixture is snapshot at; `documentSnapshotWidths` by default. */
  readonly snapshotWidths?: ReadonlyArray<number>;
  /** The glyph set the snapshot is painted with, when its mock draws its own. */
  readonly glyphs?: Glyphs;
}

/**
 * A live scene: the document the live region shows for one bound state, as a
 * pure function of the terminal size. It is bounded by width and height.
 */
interface SceneFixture {
  readonly _tag: "scene";
  readonly name: string;
  readonly scene: (terminal: TerminalSize) => Doc;
  /** Widths this fixture is snapshot at; `galleryWidths` by default. */
  readonly snapshotWidths?: ReadonlyArray<number>;
}

/**
 * One active region. An interaction takes foreground ownership over activity.
 */
interface ComposedFixture {
  readonly _tag: "composed";
  readonly name: string;
  readonly scene: Scene;
  /** Widths this fixture is snapshot at; `galleryWidths` by default. */
  readonly snapshotWidths?: ReadonlyArray<number>;
}

/** Committed history has no height bound; only the current scene can repaint. */
export interface TranscriptCheckpoint {
  readonly history: Doc;
  readonly scene: Scene;
}

interface TranscriptFixture extends TranscriptCheckpoint {
  readonly _tag: "transcript";
  readonly name: string;
  /** Widths this fixture is snapshot at; `galleryWidths` by default. */
  readonly snapshotWidths?: ReadonlyArray<number>;
}

export type GalleryFixture = DocumentFixture | SceneFixture | ComposedFixture | TranscriptFixture;

/**
 * What a gallery module exports by default. The gallery discovers every
 * `*.gallery.ts` module under the CLI's sources, so a fixture lives beside the
 * view it exercises or in this directory, and needs no registration.
 */
export class GalleryModule {
  constructor(readonly fixtures: ReadonlyArray<GalleryFixture>) {}
}

export const galleryModule = (...fixtures: ReadonlyArray<GalleryFixture>): GalleryModule =>
  new GalleryModule(fixtures);

const uniqueSorted = (widths: ReadonlyArray<number>): ReadonlyArray<number> =>
  [...new Set(widths)].sort((left, right) => left - right);

/** The widths a fixture is snapshot at. */
export const snapshotWidthsOf = (fixture: GalleryFixture): ReadonlyArray<number> =>
  fixture.snapshotWidths ?? (fixture._tag === "document" ? documentSnapshotWidths : galleryWidths);

/** The widths a fixture's invariants are checked at: every gallery width and every snapshot width. */
export const checkWidthsOf = (fixture: GalleryFixture): ReadonlyArray<number> =>
  uniqueSorted([...galleryWidths, ...snapshotWidthsOf(fixture)]);

/**
 * The terminal sizes for a set of widths: each width for a document, which
 * ignores the height, and each width by each height for a scene.
 */
export const sizesAt = (
  fixture: GalleryFixture,
  widths: ReadonlyArray<number>,
): ReadonlyArray<TerminalSize> =>
  fixture._tag === "document"
    ? widths.map((columns) => ({ columns, rows: Math.max(...galleryHeights) }))
    : widths.flatMap((columns) => galleryHeights.map((rows) => ({ columns, rows })));

/** A fixture at one size, as its test and its snapshot file are named. */
export const labelOf = (fixture: GalleryFixture, terminal: TerminalSize): string =>
  fixture._tag === "document"
    ? `${fixture.name}.${String(terminal.columns)}`
    : `${fixture.name}.${String(terminal.columns)}x${String(terminal.rows)}`;

/** The snapshot files a fixture keeps, by name, in the gallery's `__snapshots__` directory. */
export const snapshotFilesOf = (fixture: GalleryFixture): ReadonlyArray<string> =>
  sizesAt(fixture, snapshotWidthsOf(fixture)).map(
    (terminal) => `${labelOf(fixture, terminal)}.txt`,
  );

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
    case "transcript":
      return [
        ...paintText(fixture.history, { ...style, width: terminal.columns }),
        ...paintScene(fixture.scene, terminal, {
          ...style,
          spinner: (style.glyphs ?? unicodeGlyphs).spinner[0] ?? "",
          nowMs: 0,
        }),
      ];
  }
};
