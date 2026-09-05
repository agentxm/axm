import { describe, expect, it } from "vitest";

import { stripTerminalFormatting } from "../output-policy.js";
import { asciiGlyphs, paintText } from "../paint-text.js";
import { displayWidth } from "../width.js";
import { gallery, galleryWidths } from "./index.js";

const cases = gallery.flatMap((fixture) =>
  galleryWidths.map((width) => ({ name: fixture.name, doc: fixture.doc, width })),
);

describe("terminal design gallery", () => {
  it.each(cases)(
    "paints $name at $width columns within the width",
    async ({ name, doc, width }) => {
      const lines = paintText(doc, { width, colors: false });
      for (const line of lines) {
        expect(displayWidth(line), `${name}@${width}: ${line}`).toBeLessThanOrEqual(width);
        expect(line, `${name}@${width} trailing whitespace: ${JSON.stringify(line)}`).not.toMatch(
          /\s$/u,
        );
      }
      await expect(`${lines.join("\n")}\n`).toMatchFileSnapshot(
        `./__snapshots__/${name}.${width}.txt`,
      );
    },
  );

  it.each(gallery)("paints $name identically with color on and off", ({ doc }) => {
    for (const width of galleryWidths) {
      const plain = paintText(doc, { width, colors: false }).join("\n");
      const colored = paintText(doc, { width, colors: true }).join("\n");
      expect(stripTerminalFormatting(colored)).toBe(plain);
    }
  });

  it.each(gallery)("paints $name with seven-bit glyphs only", ({ doc }) => {
    const lines = paintText(doc, { width: 80, colors: false, glyphs: asciiGlyphs });
    for (const line of lines) {
      // Content may carry non-ASCII text (names, wide characters, em dashes);
      // the painter's own glyphs, connectors, and separators must not.
      expect(line).not.toMatch(/[✔▲✖●–×↶├└│·]/u);
    }
  });

  it("paints natural widths when unbounded", () => {
    for (const fixture of gallery) {
      const lines = paintText(fixture.doc, { width: "unbounded", colors: false });
      expect(lines.length).toBeLessThanOrEqual(
        paintText(fixture.doc, { width: 200, colors: false }).length,
      );
      for (const line of lines) expect(line).not.toMatch(/\s$/u);
    }
  });
});
