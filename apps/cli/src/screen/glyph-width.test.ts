import { describe, expect, it } from "vitest";

import { asciiGlyphs, unicodeGlyphs, type Glyphs } from "./glyphs.js";
import { displayWidth } from "./width.js";

/**
 * East Asian Width class of every non-ASCII glyph the sets paint, read from
 * Unicode 16.0 `EastAsianWidth.txt`. `"neutral"` collects the N and Na
 * classes, which every terminal draws in one cell. `"ambiguous"` is class A:
 * one cell outside an East Asian context, which is what UAX #11 prescribes and
 * what terminals default to, and two cells in a CJK-configured terminal.
 *
 * Where an Ambiguous glyph is drawn two cells wide, a mark is absorbed by its
 * own gutter, while a glyph inside a line's content pushes the rest of the line
 * right. `"ambiguous-inline"` records class A for a character the design
 * accepts that for; plain `"ambiguous"` is accepted in the gutter alone.
 *
 * This table is the one place a new glyph is recorded: a glyph missing from it
 * fails the coverage test below, and an Ambiguous one used inline fails until
 * its entry says the design accepts it there.
 */
const eastAsianWidth = {
  "✔": "neutral", // ✔ HEAVY CHECK MARK
  "✖": "neutral", // ✖ HEAVY MULTIPLICATION X
  "↶": "neutral", // ↶ ANTICLOCKWISE TOP SEMICIRCLE ARROW
  "❯": "neutral", // ❯ HEAVY RIGHT-POINTING ANGLE QUOTATION MARK ORNAMENT
  "◒": "neutral", // ◒ CIRCLE WITH LOWER HALF BLACK
  "◓": "neutral", // ◓ CIRCLE WITH UPPER HALF BLACK
  "◉": "neutral", // ◉ FISHEYE
  "◪": "neutral", // ◪ SQUARE WITH LOWER RIGHT DIAGONAL HALF BLACK
  "▲": "ambiguous", // ▲ BLACK UP-POINTING TRIANGLE
  "●": "ambiguous", // ● BLACK CIRCLE
  "◯": "ambiguous", // ◯ LARGE CIRCLE
  "·": "ambiguous-inline", // · MIDDLE DOT
  "├": "ambiguous-inline", // ├ BOX DRAWINGS LIGHT VERTICAL AND RIGHT
  "─": "ambiguous-inline", // ─ BOX DRAWINGS LIGHT HORIZONTAL
  "└": "ambiguous-inline", // └ BOX DRAWINGS LIGHT UP AND RIGHT
  "│": "ambiguous-inline", // │ BOX DRAWINGS LIGHT VERTICAL
  "←": "ambiguous-inline", // ← LEFTWARDS ARROW
  "→": "ambiguous-inline", // → RIGHTWARDS ARROW
  "↑": "ambiguous-inline", // ↑ UPWARDS ARROW
  "↓": "ambiguous-inline", // ↓ DOWNWARDS ARROW
  "…": "ambiguous-inline", // … HORIZONTAL ELLIPSIS
} as const satisfies Readonly<Record<string, WidthClass>>;

type WidthClass = "neutral" | "ambiguous" | "ambiguous-inline";

const isSevenBit = (glyph: string): boolean => /^[\x20-\x7e]*$/u.test(glyph);

/** Every character of a glyph, dropping the padding spaces a connector carries. */
const characters = (glyph: string): ReadonlyArray<string> =>
  [...glyph].filter((character) => character !== " ");

const recordedWidths: Readonly<Record<string, WidthClass>> = eastAsianWidth;

const widthClass = (character: string): WidthClass | undefined =>
  isSevenBit(character)
    ? "neutral"
    : Object.hasOwn(recordedWidths, character)
      ? recordedWidths[character]
      : undefined;

/** The marks a set paints in the gutter, where a wider render shifts only its own row. */
const gutterMarks = (glyphs: Glyphs): ReadonlyArray<string> => [
  ...Object.values(glyphs.outcomes),
  ...Object.values(glyphs.marks),
  ...glyphs.spinner,
];

/** The glyphs a set paints inside a line's content, beside text. */
const inlineGlyphs = (glyphs: Glyphs): ReadonlyArray<string> => [
  ...Object.values(glyphs.tree),
  glyphs.separator,
  glyphs.ellipsis,
  ...Object.values(glyphs.arrows),
  ...Object.values(glyphs.hintKeys),
];

const sets = [
  { name: "Unicode", glyphs: unicodeGlyphs },
  { name: "ASCII", glyphs: asciiGlyphs },
] as const;

/**
 * The gutter is a space, the mark, and spaces to fill five cells, so a mark
 * has four cells before it would push content past column six.
 */
const MARK_BUDGET = 4;

describe("glyph width", () => {
  it.each(sets)("records a width class for every $name glyph", ({ glyphs }) => {
    for (const glyph of [...gutterMarks(glyphs), ...inlineGlyphs(glyphs)]) {
      for (const character of characters(glyph)) {
        expect(
          widthClass(character),
          `U+${(character.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")} ${character} has no recorded East Asian Width class`,
        ).toBeDefined();
      }
    }
  });

  it.each(sets)("measures every $name glyph as one cell per character", ({ glyphs }) => {
    for (const glyph of [...gutterMarks(glyphs), ...inlineGlyphs(glyphs)]) {
      expect(displayWidth(glyph), glyph).toBe([...glyph].length);
    }
  });

  it.each(sets)("keeps every $name mark inside the gutter", ({ glyphs }) => {
    for (const mark of gutterMarks(glyphs)) {
      expect(displayWidth(mark), mark).toBeLessThanOrEqual(MARK_BUDGET);
    }
  });

  it("paints a spinner whose width never changes between frames", () => {
    for (const frame of unicodeGlyphs.spinner) {
      // A Neutral frame is one cell under both width assumptions, so the
      // animation cannot shift the line it prefixes as it advances.
      expect(widthClass(frame), frame).toBe("neutral");
      expect(displayWidth(frame), frame).toBe(1);
    }
    expect(new Set(unicodeGlyphs.spinner.map(displayWidth)).size).toBe(1);
  });

  it("paints inline only the ambiguous-width glyphs the design accepts there", () => {
    for (const glyph of inlineGlyphs(unicodeGlyphs)) {
      for (const character of characters(glyph)) {
        expect(
          widthClass(character),
          `${character} is Ambiguous and painted inside a line: record it as "ambiguous-inline" once the design accepts that`,
        ).not.toBe("ambiguous");
      }
    }
    for (const glyph of inlineGlyphs(asciiGlyphs)) expect(isSevenBit(glyph), glyph).toBe(true);
  });

  it("keeps a status mark from doubling as a completed change", () => {
    for (const { glyphs } of sets) {
      const statuses = [
        glyphs.outcomes.ok,
        glyphs.outcomes.warn,
        glyphs.outcomes.error,
        glyphs.outcomes.info,
      ];
      // `+` meant both `ok` and `create` in the ASCII set, so a created row and
      // a satisfied one were indistinguishable.
      for (const change of ["create", "update", "remove", "unchanged"] as const) {
        expect(statuses, `${glyphs.outcomes[change]} for ${change}`).not.toContain(
          glyphs.outcomes[change],
        );
      }
      // An outcome that did not complete carries the status mark of the same
      // meaning, so ▲ reads as attention and ✖ as failure wherever it appears.
      expect(glyphs.outcomes.blocked).toBe(glyphs.outcomes.warn);
      expect(glyphs.outcomes.failed).toBe(glyphs.outcomes.error);
    }
  });

  it("paints the ASCII set with seven-bit characters only", () => {
    for (const glyph of [...gutterMarks(asciiGlyphs), ...inlineGlyphs(asciiGlyphs)]) {
      expect(isSevenBit(glyph), glyph).toBe(true);
    }
  });
});
