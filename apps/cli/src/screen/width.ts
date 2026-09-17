const terminalFormattingPattern =
  // eslint-disable-next-line no-control-regex -- width must ignore terminal CSI and OSC sequences.
  /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\))/gu;

const ESCAPE = "\u001b";
const RESET = `${ESCAPE}[0m`;
const LINK_OPEN = `${ESCAPE}]8;;`;
const LINK_CLOSE = `${LINK_OPEN}${ESCAPE}\\`;
const ELLIPSIS = "…";

/** One painted token: a terminal sequence, which takes no cell, or one code point. */
const tokenPattern = new RegExp(`${terminalFormattingPattern.source}|[\\s\\S]`, "gu");

export const stripTerminalFormatting = (value: string): string =>
  value.replace(terminalFormattingPattern, "");

const isWideCodePoint = (codePoint: number): boolean =>
  codePoint >= 0x1100 &&
  (codePoint <= 0x115f ||
    codePoint === 0x2329 ||
    codePoint === 0x232a ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1faff) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd));

/** Cells one code point occupies: none for a joiner or combining mark, two when wide. */
const codePointWidth = (codePoint: number): number => {
  if (codePoint === 0 || codePoint === 0x200d) return 0;
  if (codePoint >= 0x300 && codePoint <= 0x36f) return 0;
  return isWideCodePoint(codePoint) ? 2 : 1;
};

export const displayWidth = (value: string): number => {
  let width = 0;
  for (const character of stripTerminalFormatting(value)) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) continue;
    width += codePointWidth(codePoint);
  }
  return width;
};

/**
 * Terminal rows a line of this display width fills at the given terminal
 * width. A line the terminal rewrapped fills more rows than the single row it
 * was painted as, which is what erasing it again has to cover.
 */
export const renderedRows = (width: number, columns: number): number =>
  columns <= 0 ? 1 : Math.max(1, Math.ceil(width / columns));

/**
 * Shorten a painted line to `width` cells, keeping its terminal formatting and
 * marking the cut with an ellipsis. Styling and hyperlinks the line opened are
 * closed at the cut, because the sequences that would have closed them are
 * gone. A line already within the width is returned untouched.
 */
export const truncateLine = (value: string, width: number): string => {
  if (width <= 0) return "";
  if (displayWidth(value) <= width) return value;
  if (width === 1) return ELLIPSIS;
  const limit = width - displayWidth(ELLIPSIS);
  let kept = "";
  let used = 0;
  let styled = false;
  let linked = false;
  for (const [token] of value.matchAll(tokenPattern)) {
    if (token.startsWith(ESCAPE)) {
      kept += token;
      if (token.startsWith(LINK_OPEN)) linked = token !== LINK_CLOSE;
      else styled = true;
      continue;
    }
    const size = codePointWidth(token.codePointAt(0) ?? 0);
    if (used + size > limit) break;
    kept += token;
    used += size;
  }
  return `${kept}${ELLIPSIS}${linked ? LINK_CLOSE : ""}${styled ? RESET : ""}`;
};

export const padDisplay = (
  value: string,
  width: number,
  align: "left" | "right" = "left",
): string => {
  const padding = " ".repeat(Math.max(0, width - displayWidth(value)));
  return align === "right" ? `${padding}${value}` : `${value}${padding}`;
};

/** Display width of one character, for walking a string column by column. */
const characterWidth = (character: string): number => {
  const codePoint = character.codePointAt(0);
  return codePoint !== undefined && isWideCodePoint(codePoint) ? 2 : 1;
};

/** The longest prefix of `value` no wider than `width`, never splitting a character. */
export const takeDisplayStart = (value: string, width: number): string => {
  let result = "";
  let used = 0;
  for (const character of stripTerminalFormatting(value)) {
    const size = characterWidth(character);
    if (used + size > width) break;
    result += character;
    used += size;
  }
  return result;
};

/** The longest suffix of `value` no wider than `width`, never splitting a character. */
export const takeDisplayEnd = (value: string, width: number): string => {
  let result = "";
  let used = 0;
  const characters = [...stripTerminalFormatting(value)];
  for (let index = characters.length - 1; index >= 0; index -= 1) {
    const character = characters[index] ?? "";
    const size = characterWidth(character);
    if (used + size > width) break;
    result = `${character}${result}`;
    used += size;
  }
  return result;
};

/**
 * Where a value gives way when it is wider than its column: `"end"` keeps the
 * start, `"middle"` keeps both ends. A name shortens in the middle so its
 * scope and its last path segment — the parts that tell two names apart —
 * both survive.
 */
export type TruncateMode = "end" | "middle";

const SEPARATOR = "/";

/**
 * Shorten a path-like name from its middle: keep the scope whole and drop as
 * few trailing segments as the width allows (`@acme-enterprise/…/soc2-review`),
 * and once the scope itself no longer fits, keep the last segment — the part
 * that tells two names apart — and give what is left to the scope. Undefined
 * when the value is one segment, or too narrow for even the last one.
 */
const shortenPath = (value: string, width: number): string | undefined => {
  const [first, ...rest] = value.split(SEPARATOR);
  if (first === undefined || rest.length === 0) return undefined;
  for (let kept = rest.length - 1; kept >= 1; kept -= 1) {
    const candidate = `${first}${SEPARATOR}…${SEPARATOR}${rest.slice(rest.length - kept).join(SEPARATOR)}`;
    if (displayWidth(candidate) <= width) return candidate;
  }
  const tail = `…${SEPARATOR}${rest[rest.length - 1] ?? ""}`;
  const head = takeDisplayStart(value, width - displayWidth(tail));
  return head.length === 0 ? undefined : `${head}${tail}`;
};

export const truncateDisplay = (
  value: string,
  width: number,
  mode: TruncateMode = "end",
): string => {
  if (width <= 0) return "";
  if (displayWidth(value) <= width) return value;
  if (width === 1) return "…";
  if (mode === "end") return `${takeDisplayStart(value, width - 1)}…`;

  const segmented = shortenPath(value, width);
  if (segmented !== undefined) return segmented;
  const head = Math.ceil((width - 1) / 2);
  return `${takeDisplayStart(value, head)}…${takeDisplayEnd(value, width - 1 - head)}`;
};

const splitLongWord = (word: string, width: number): ReadonlyArray<string> => {
  const parts: Array<string> = [];
  let current = "";
  for (const character of word) {
    if (displayWidth(`${current}${character}`) > width && current.length > 0) {
      parts.push(current);
      current = character;
    } else {
      current += character;
    }
  }
  if (current.length > 0) parts.push(current);
  return parts;
};

export const wrapDisplay = (value: string, width: number): ReadonlyArray<string> => {
  const safeWidth = Math.max(1, width);
  const result: Array<string> = [];
  for (const sourceLine of value.split("\n")) {
    if (sourceLine.length === 0) {
      result.push("");
      continue;
    }
    const words = sourceLine.split(/\s+/u).flatMap((word) => splitLongWord(word, safeWidth));
    let current = "";
    for (const word of words) {
      const candidate = current.length === 0 ? word : `${current} ${word}`;
      if (displayWidth(candidate) <= safeWidth) {
        current = candidate;
      } else {
        if (current.length > 0) result.push(current);
        current = word;
      }
    }
    if (current.length > 0) result.push(current);
  }
  return result;
};
