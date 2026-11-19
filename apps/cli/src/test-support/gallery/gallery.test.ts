import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { stripTerminalFormatting } from "../../screen/width.js";
import { paintText } from "../../screen/paint-text.js";
import { asciiGlyphs } from "../../screen/glyphs.js";
import { displayWidth } from "../../screen/width.js";
import { copyableValues, verbatimLines } from "../conformance/conformance-suite.js";
import { loadGallery } from "./discover.js";
import {
  checkWidthsOf,
  labelOf,
  paintFixture,
  sizesAt,
  snapshotFilesOf,
  snapshotWidthsOf,
} from "./fixture.js";

const gallery = await loadGallery();

/** Every size a fixture is checked at, and whether that size also has a snapshot. */
const cases = gallery.flatMap((fixture) => {
  const snapshotWidths = new Set(snapshotWidthsOf(fixture));
  return sizesAt(fixture, checkWidthsOf(fixture)).map((terminal) => ({
    fixture,
    terminal,
    label: labelOf(fixture, terminal),
    snapshot: snapshotWidths.has(terminal.columns),
  }));
});

const snapshotDirectory = new URL("./__snapshots__/", import.meta.url);

describe("terminal design gallery", () => {
  it.each(cases)(
    "paints $label within the terminal",
    async ({ fixture, terminal, label, snapshot }) => {
      const lines = paintFixture(fixture, terminal, { colors: false });
      // A live line that reaches the last column wraps, so a scene stops one short.
      const history =
        fixture._tag === "transcript"
          ? fixture.history
          : fixture._tag === "document"
            ? fixture.doc
            : [];
      const historyLines = paintText(history, { width: terminal.columns, colors: false }).length;
      // A copyable value is never cut: it is shown whole and may overflow. A
      // live scene carries none, so every line of a scene fits.
      const copyable = copyableValues(history);
      for (const value of copyable) {
        expect(
          lines.some((line) => line.includes(value)),
          `${label} cut a copyable value: ${value}`,
        ).toBe(true);
      }
      // Content passed through verbatim, such as a command's own output, is
      // never wrapped, so its lines may overflow too.
      const verbatim = verbatimLines(history);
      for (const [index, line] of lines.entries()) {
        const width = index < historyLines ? terminal.columns : terminal.columns - 1;
        if (!copyable.some((value) => line.includes(value)) && !verbatim.has(line.trim())) {
          expect(displayWidth(line), `${label}: ${line}`).toBeLessThanOrEqual(width);
        }
        expect(line, `${label} trailing whitespace: ${JSON.stringify(line)}`).not.toMatch(/\s$/u);
      }
      if (fixture._tag !== "document") {
        expect(lines.length - historyLines, `${label} active height`).toBeLessThanOrEqual(
          terminal.rows - 2,
        );
      }
      if (snapshot) {
        await expect(`${lines.join("\n")}\n`).toMatchFileSnapshot(`./__snapshots__/${label}.txt`);
      }
    },
  );

  it.effect("keeps a snapshot file only for a fixture size that is snapshot", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const expected = new Set(gallery.flatMap(snapshotFilesOf));
      const present = yield* fs.readDirectory(yield* path.fromFileUrl(snapshotDirectory));
      expect(present.filter((file) => !expected.has(file)).sort(), "orphaned snapshots").toEqual(
        [],
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it("preserves every committed line when an active transcript exceeds the viewport", () => {
    for (const fixture of gallery) {
      if (fixture._tag !== "transcript") continue;
      const terminal = { columns: 40, rows: 4 };
      const history = paintText(fixture.history, { width: terminal.columns, colors: false });
      const lines = paintFixture(fixture, terminal, { colors: false });
      expect(lines.slice(0, history.length)).toEqual(history);
      expect(lines.length - history.length).toBeLessThanOrEqual(2);
    }
  });

  it.each(gallery)("paints $name identically with color on and off", (fixture) => {
    for (const terminal of sizesAt(fixture, checkWidthsOf(fixture))) {
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
      // the painter's own glyphs and separators must not.
      expect(line).not.toMatch(/[✔▲✖●↶◒◓◉◯◪❯·↑↓]/u);
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
