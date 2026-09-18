import { plain } from "./doc.js";
import type { Mark, Span, Text, Tint, Tone } from "./doc.js";
import { unicodeGlyphs, type Glyphs } from "./glyphs.js";
import { displayWidth, truncateLine } from "./width.js";
import { spansOf, truncateText, wrapText } from "./wrap-text.js";

export const ESC = "\u001b[";
export const RESET = `${ESC}0m`;
/** Reverse video: the terminal's own way to fill a cell behind its text. */
export const INVERT = `${ESC}7m`;
export const COLUMN_GAP = 3;
/**
 * Every marked node paints its mark in this gutter — a space, the mark, and
 * spaces to fill — so content after any mark starts at the same column.
 */
export const GUTTER_WIDTH = 5;
/**
 * Preferred width of the key lane between the gutter and the value column,
 * matching the preferred width of a ledger's name column.
 */
export const KEY_WIDTH = 27;
export const MIN_FIELD_VALUE_WIDTH = 12;
/** `"unbounded"` paints natural widths: no wrapping, truncation, or padding to a terminal width. */
export type PaintWidth = number | "unbounded";

export interface PaintStyle {
  readonly width: PaintWidth;
  readonly colors: boolean;
  readonly glyphs?: Glyphs;
  /**
   * The spinner frame a running mark paints, which the live region advances on
   * each repaint. A still document leaves it out and takes the set's first
   * frame, so the same document paints the same way twice.
   */
  readonly spinner?: string;
  /** Whether authored text may wrap. Live scenes disable it so row budgets stay exact. */
  readonly wrap?: boolean;
}

export interface ResolvedStyle {
  readonly width: PaintWidth;
  readonly colors: boolean;
  readonly glyphs: Glyphs;
  readonly spinner: string;
  readonly wrap: boolean;
  /**
   * Cells before the value column that field values and callout asides share
   * across one document; below twice its preferred column it moves left to
   * keep half the terminal width for values.
   */
  readonly valueColumn: number;
}

export const resolveStyle = (style: PaintStyle): ResolvedStyle => {
  const width = style.width === "unbounded" ? "unbounded" : Math.max(20, style.width);
  const preferred = GUTTER_WIDTH + KEY_WIDTH + COLUMN_GAP;
  const glyphs = style.glyphs ?? unicodeGlyphs;
  return {
    width,
    colors: style.colors,
    glyphs,
    spinner: style.spinner ?? glyphs.spinner[0] ?? "",
    wrap: style.wrap ?? true,
    valueColumn:
      width === "unbounded"
        ? preferred
        : Math.max(GUTTER_WIDTH, Math.min(preferred, Math.floor(width / 2))),
  };
};

export const toneCodes: Readonly<Record<Tone, string>> = {
  neutral: "",
  ok: `${ESC}32m`,
  warn: `${ESC}33m`,
  error: `${ESC}31m`,
  info: `${ESC}36m`,
  dim: `${ESC}2m`,
};

export const tintCodes: Readonly<Record<Tint, string>> = {
  green: `${ESC}32m`,
  yellow: `${ESC}33m`,
  blue: `${ESC}34m`,
  magenta: `${ESC}35m`,
  cyan: `${ESC}36m`,
};

export const colorCode = (span: Span): string =>
  span.tone === undefined && span.tint !== undefined
    ? tintCodes[span.tint]
    : toneCodes[span.tone ?? "neutral"];

export const styleSpan = (span: Span, colors: boolean): string => {
  if (!colors) return span.text;
  const prefix = `${span.bold === true ? `${ESC}1m` : ""}${span.invert === true ? INVERT : ""}${colorCode(span)}`;
  const linked =
    span.link === undefined
      ? span.text
      : `\u001b]8;;${span.link}\u001b\\${span.text}\u001b]8;;\u001b\\`;
  return prefix.length === 0 ? linked : `${prefix}${linked}${RESET}`;
};

export const paintSpans = (
  spans: ReadonlyArray<Span>,
  style: ResolvedStyle,
  inherited?: Tone,
): string =>
  spans
    .map((span) => {
      // A tinted span keeps its own colour inside a toned line.
      const tone = span.tone ?? (span.tint === undefined ? inherited : undefined);
      return styleSpan(tone === undefined ? span : { ...span, tone }, style.colors);
    })
    .join("");

export const paintValue = (value: Text, style: ResolvedStyle, inherited?: Tone): string =>
  paintSpans(typeof value === "string" ? [{ text: value }] : value, style, inherited);

/** Width left for content after `used` cells, never below one cell. */
export const remaining = (width: PaintWidth, used: number): PaintWidth =>
  width === "unbounded" ? "unbounded" : Math.max(1, width - used);

export const fits = (width: PaintWidth, line: string): boolean =>
  width === "unbounded" || displayWidth(line) <= width;

/** Wrap and paint a value into lines without any indentation. */
export const paintLines = (
  value: Text,
  width: PaintWidth,
  style: ResolvedStyle,
  tone?: Tone,
): ReadonlyArray<string> =>
  (style.wrap || width === "unbounded"
    ? wrapText(value, width)
    : [spansOf(truncateText(value, width, "end", style.glyphs.ellipsis))]
  ).map((line) => paintSpans(line, style, tone));

export const spaces = (count: number): string => " ".repeat(Math.max(0, count));

/**
 * Paint a value behind a first-line prefix, continuation lines behind `rest`
 * (defaulting to blank space as wide as `first`).
 */
export const paintPrefixed = (
  value: Text,
  style: ResolvedStyle,
  options: {
    readonly indent: number;
    readonly first: string;
    readonly rest?: string;
    readonly tone?: Tone;
  },
): ReadonlyArray<string> => {
  const rest = options.rest ?? spaces(displayWidth(options.first));
  const used = options.indent + Math.max(displayWidth(options.first), displayWidth(rest));
  const lines = paintLines(value, remaining(style.width, used), style, options.tone);
  const indent = spaces(options.indent);
  return (lines.length === 0 ? [""] : lines).map(
    (line, index) => `${indent}${index === 0 ? options.first : rest}${line}`,
  );
};

export const dim = (value: string, style: ResolvedStyle): string =>
  paintSpans([{ text: value, tone: "dim" }], style);

export const statusGlyph = (tone: Tone, glyphs: Glyphs): string | undefined =>
  tone === "neutral" || tone === "dim" ? undefined : glyphs.outcomes[tone];

/**
 * The glyph a ledger row's mark paints: a status glyph, a change operation,
 * or — while a unit is still in flight — the spinner frame or the waiting mark.
 */
export const markGlyph = (mark: Mark, style: ResolvedStyle): string => {
  if (mark === "working") return style.spinner;
  if (mark === "waiting") return style.glyphs.marks.waiting;
  return style.glyphs.outcomes[mark];
};

/** A mark (or none) in the gutter, padded so content starts after it. */
export const gutter = (mark: string | undefined): string => {
  const cell = ` ${mark ?? ""}`;
  return `${cell}${spaces(GUTTER_WIDTH - displayWidth(cell))}`;
};

export const blankGutter = spaces(GUTTER_WIDTH);

export const bold = (value: Text): ReadonlyArray<Span> =>
  (typeof value === "string" ? [{ text: value }] : value).map((span) => ({ ...span, bold: true }));

export const joinedParts = (
  parts: ReadonlyArray<{ readonly text: Text }>,
  glyphs: Glyphs,
): ReadonlyArray<Span> =>
  parts.flatMap((part, index) => [
    ...(index === 0 ? [] : [{ text: glyphs.separator }]),
    ...(typeof part.text === "string" ? [{ text: part.text }] : part.text),
  ]);

/**
 * Append a dim aside to the last line when it fits, else paint it wrapped on
 * lines of its own at `ownLineIndent`.
 */
export const withSupplement = (
  lines: ReadonlyArray<string>,
  trailing: Text,
  style: ResolvedStyle,
  ownLineIndent: number,
  options?: {
    readonly gap?: string | ((last: string) => string);
    readonly ownLine?: Text;
  },
): ReadonlyArray<string> => {
  if (plain(trailing).length === 0) return lines;
  const painted = paintValue(trailing, style, "dim");
  if (painted.length === 0) return lines;
  const last = lines[lines.length - 1];
  const gap =
    last === undefined || typeof options?.gap !== "function"
      ? (options?.gap ?? "  ")
      : options.gap(last);
  const joined = last === undefined ? undefined : `${last}${gap}${painted}`;
  if (joined !== undefined && fits(style.width, joined)) return [...lines.slice(0, -1), joined];
  if (!style.wrap && joined !== undefined && style.width !== "unbounded") {
    return [...lines.slice(0, -1), truncateLine(joined, style.width, style.glyphs.ellipsis)];
  }
  return [
    ...lines,
    ...paintPrefixed(options?.ownLine ?? trailing, style, {
      indent: ownLineIndent,
      first: "",
      tone: "dim",
    }),
  ];
};
