/**
 * Paint the terminal design gallery for review.
 *
 * Usage:
 *   bun --conditions=axm-source scripts/paint-gallery.ts [--name <fixture>] [--width <columns>] [--rows <rows>] [--ascii] [--plain]
 *
 * Defaults to every fixture at the current terminal size. `--rows` sets the
 * terminal height a live scene is fitted to; settled documents ignore it.
 */

// @effect-diagnostics nodeBuiltinImport:off globalConsole:off — review-time gallery painter, not Effect code

import { paintFixture } from "../src/test-support/gallery/fixture.js";
import { gallery } from "../src/test-support/gallery/index.js";
import { resolveCliOutputPolicy } from "../src/screen/output-policy.js";
import { asciiGlyphs, unicodeGlyphs } from "../src/screen/paint-text.js";

interface Options {
  readonly name: string | undefined;
  readonly width: number;
  readonly rows: number;
  readonly colors: boolean;
  readonly ascii: boolean;
}

const usage = (): never => {
  console.error(
    "usage: paint-gallery [--name <fixture>] [--width <columns>] [--rows <rows>] [--ascii] [--plain]\n" +
      `fixtures: ${gallery.map((fixture) => fixture.name).join(", ")}`,
  );
  process.exit(2);
};

const parseOptions = (argv: ReadonlyArray<string>): Options => {
  const policy = resolveCliOutputPolicy();
  let name: string | undefined;
  let width = process.stdout.columns ?? 80;
  let rows = process.stdout.rows ?? 24;
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
      case "--rows": {
        const parsed = Number(argv[index + 1]);
        index += 1;
        if (!Number.isInteger(parsed) || parsed <= 0) usage();
        rows = parsed;
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
  return { name, width, rows, colors, ascii };
};

const options = parseOptions(process.argv.slice(2));
const selected =
  options.name === undefined ? gallery : gallery.filter((fixture) => fixture.name === options.name);
if (selected.length === 0) usage();

for (const fixture of selected) {
  const size =
    fixture._tag === "document"
      ? String(options.width)
      : `${String(options.width)}x${String(options.rows)}`;
  console.log(
    `── ${fixture.name} @ ${size} ${"─".repeat(Math.max(0, options.width - fixture.name.length - 8 - size.length))}`,
  );
  const lines = paintFixture(
    fixture,
    { columns: options.width, rows: options.rows },
    { colors: options.colors, glyphs: options.ascii ? asciiGlyphs : unicodeGlyphs },
  );
  console.log(lines.join("\n"));
  console.log("");
}
