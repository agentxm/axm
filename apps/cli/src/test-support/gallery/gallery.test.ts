import { describe, expect, it } from "vitest";

import { stripTerminalFormatting } from "../../screen/width.js";
import { paintText } from "../../screen/paint-text.js";
import { asciiGlyphs } from "../../screen/glyphs.js";
import type { TerminalSize } from "../../screen/scene.js";
import { displayWidth } from "../../screen/width.js";
import { copyableValues } from "../conformance/conformance-suite.js";
import { paintFixture, type GalleryFixture } from "./fixture.js";
import { gallery, galleryHeights, galleryWidths } from "./index.js";

/**
 * The terminal sizes a fixture is snapshot at: widths for a document, which
 * ignores the height, and widths by heights for a scene.
 */
const sizesFor = (fixture: GalleryFixture): ReadonlyArray<TerminalSize> => {
  const widths = fixture.widths ?? galleryWidths;
  return fixture._tag === "document"
    ? widths.map((columns) => ({ columns, rows: Math.max(...galleryHeights) }))
    : widths.flatMap((columns) => galleryHeights.map((rows) => ({ columns, rows })));
};

const cases = gallery.flatMap((fixture) =>
  sizesFor(fixture).map((terminal) => ({
    fixture,
    terminal,
    label:
      fixture._tag === "document"
        ? `${fixture.name}.${String(terminal.columns)}`
        : `${fixture.name}.${String(terminal.columns)}x${String(terminal.rows)}`,
  })),
);

describe("terminal design gallery", () => {
  it.each(cases)("paints $label within the terminal", async ({ fixture, terminal, label }) => {
    const lines = paintFixture(fixture, terminal, { colors: false });
    // A live line that reaches the last column wraps, so a scene stops one short.
    const width = fixture._tag === "document" ? terminal.columns : terminal.columns - 1;
    // A copyable value is never cut: it is shown whole and may overflow. A
    // live scene carries none, so every line of a scene fits.
    const copyable = fixture._tag === "document" ? copyableValues(fixture.doc) : [];
    for (const value of copyable) {
      expect(
        lines.some((line) => line.includes(value)),
        `${label} cut a copyable value: ${value}`,
      ).toBe(true);
    }
    for (const line of lines) {
      if (!copyable.some((value) => line.includes(value))) {
        expect(displayWidth(line), `${label}: ${line}`).toBeLessThanOrEqual(width);
      }
      expect(line, `${label} trailing whitespace: ${JSON.stringify(line)}`).not.toMatch(/\s$/u);
    }
    if (fixture._tag !== "document") {
      expect(lines.length, `${label} height`).toBeLessThanOrEqual(terminal.rows - 2);
    }
    await expect(`${lines.join("\n")}\n`).toMatchFileSnapshot(`./__snapshots__/${label}.txt`);
  });

  it.each(gallery)("paints $name identically with color on and off", (fixture) => {
    for (const terminal of sizesFor(fixture)) {
      const plain = paintFixture(fixture, terminal, { colors: false }).join("\n");
      const colored = paintFixture(fixture, terminal, { colors: true }).join("\n");
      expect(stripTerminalFormatting(colored)).toBe(plain);
    }
  });

  it.each(gallery)("paints $name with seven-bit glyphs only", (fixture) => {
    const lines = paintFixture(
      fixture,
      { columns: 80, rows: 24 },
      { colors: false, glyphs: asciiGlyphs },
    );
    for (const line of lines) {
      // Content may carry non-ASCII text (names, wide characters, em dashes);
      // the painter's own glyphs, connectors, and separators must not.
      expect(line).not.toMatch(/[✔▲✖●↶◒◓◉◯◪❯├└│·↑↓]/u);
    }
  });

  it("paints natural widths when unbounded", () => {
    // A live scene exists only on a terminal; unbounded output is settled documents.
    for (const fixture of gallery) {
      if (fixture._tag !== "document") continue;
      const lines = paintText(fixture.doc, { width: "unbounded", colors: false });
      expect(lines.length).toBeLessThanOrEqual(
        paintText(fixture.doc, { width: 200, colors: false }).length,
      );
      for (const line of lines) expect(line).not.toMatch(/\s$/u);
    }
  });
});
