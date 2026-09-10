/**
 * Paint the terminal design gallery for review.
 *
 * Usage:
 *   bun --conditions=axm-source scripts/paint-gallery.ts [--name <fixture>] [--width <columns>] [--ascii] [--plain]
 *
 * Defaults to every fixture at the current terminal width.
 */

// @effect-diagnostics nodeBuiltinImport:off globalConsole:off — review-time gallery painter, not Effect code

import { gallery } from "../src/screen/gallery/index.js";
import { resolveCliOutputPolicy } from "../src/screen/output-policy.js";
import { asciiGlyphs, paintText, unicodeGlyphs } from "../src/screen/paint-text.js";

interface Options {
  readonly name: string | undefined;
  readonly width: number;
  readonly colors: boolean;
  readonly ascii: boolean;
}

const usage = (): never => {
  console.error(
    "usage: paint-gallery [--name <fixture>] [--width <columns>] [--ascii] [--plain]\n" +
      `fixtures: ${gallery.map((fixture) => fixture.name).join(", ")}`,
  );
  process.exit(2);
};

const parseOptions = (argv: ReadonlyArray<string>): Options => {
  const policy = resolveCliOutputPolicy();
  let name: string | undefined;
  let width = process.stdout.columns ?? 80;
  let colors = policy.colors;
  let ascii = policy.glyphs === "ascii";
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--name": {
        name = argv[index + 1];
        index += 1;
        if (name === undefined) usage();
        break;
      }
      case "--width": {
        const parsed = Number(argv[index + 1]);
        index += 1;
        if (!Number.isInteger(parsed) || parsed <= 0) usage();
        width = parsed;
        break;
      }
      case "--ascii":
        ascii = true;
        break;
      case "--plain":
        colors = false;
        break;
      default:
        usage();
    }
  }
  return { name, width, colors, ascii };
};

const options = parseOptions(process.argv.slice(2));
const selected =
  options.name === undefined ? gallery : gallery.filter((fixture) => fixture.name === options.name);
if (selected.length === 0) usage();

for (const fixture of selected) {
  console.log(
    `── ${fixture.name} @ ${options.width} ${"─".repeat(Math.max(0, options.width - fixture.name.length - 8 - String(options.width).length))}`,
  );
  const lines = paintText(fixture.doc, {
    width: options.width,
    colors: options.colors,
    glyphs: options.ascii ? asciiGlyphs : unicodeGlyphs,
  });
  console.log(lines.join("\n"));
  console.log("");
}
