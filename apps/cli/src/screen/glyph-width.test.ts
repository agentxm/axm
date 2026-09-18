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
 * A glyph missing from this table fails the coverage test below, so a new
 * glyph cannot enter either set without its width class being recorded here.
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
  "·": "ambiguous", // · MIDDLE DOT
  "├": "ambiguous", // ├ BOX DRAWINGS LIGHT VERTICAL AND RIGHT
  "─": "ambiguous", // ─ BOX DRAWINGS LIGHT HORIZONTAL
  "└": "ambiguous", // └ BOX DRAWINGS LIGHT UP AND RIGHT
  "│": "ambiguous", // │ BOX DRAWINGS LIGHT VERTICAL
  "↑": "ambiguous", // ↑ UPWARDS ARROW
  "↓": "ambiguous", // ↓ DOWNWARDS ARROW
  "…": "ambiguous", // … HORIZONTAL ELLIPSIS
} as const satisfies Readonly<Record<string, "neutral" | "ambiguous">>;

const isSevenBit = (glyph: string): boolean => /^[\x20-\x7e]*$/u.test(glyph);

/** Every character of a glyph, dropping the padding spaces a connector carries. */
const characters = (glyph: string): ReadonlyArray<string> =>
  [...glyph].filter((character) => character !== " ");

const widthClass = (character: string): "neutral" | "ambiguous" | undefined =>
  isSevenBit(character)
    ? "neutral"
    : (eastAsianWidth as Readonly<Record<string, "neutral" | "ambiguous">>)[character];

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

  it("records every accepted ambiguous-width inline glyph", () => {
    // Where an Ambiguous glyph is drawn two cells wide, a mark is absorbed by
    // its own gutter, while an inline glyph pushes the rest of its line right.
    // These are the inline roles the design accepts that for; a new one has to
    // be added here deliberately.
    const ambiguous = inlineGlyphs(unicodeGlyphs).filter((glyph) =>
      characters(glyph).some((character) => widthClass(character) === "ambiguous"),
    );
    expect(ambiguous).toEqual(["├─ ", "└─ ", "│  ", " · ", "…", "↑", "↓", "↑↓"]);
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
