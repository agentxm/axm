const terminalFormattingPattern =
  // eslint-disable-next-line no-control-regex -- width must ignore terminal CSI and OSC sequences.
  /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\))/gu;

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

export const displayWidth = (value: string): number => {
  let width = 0;
  for (const character of stripTerminalFormatting(value)) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined || codePoint === 0 || codePoint === 0x200d) continue;
    if (codePoint >= 0x300 && codePoint <= 0x36f) continue;
    width += isWideCodePoint(codePoint) ? 2 : 1;
  }
  return width;
};

export const padDisplay = (
  value: string,
  width: number,
  align: "left" | "right" = "left",
): string => {
  const padding = " ".repeat(Math.max(0, width - displayWidth(value)));
  return align === "right" ? `${padding}${value}` : `${value}${padding}`;
};

export const truncateDisplay = (value: string, width: number): string => {
  if (width <= 0) return "";
  if (displayWidth(value) <= width) return value;
  if (width === 1) return "…";

  let result = "";
  let used = 0;
  for (const character of stripTerminalFormatting(value)) {
    const codePoint = character.codePointAt(0);
    const characterWidth = codePoint !== undefined && isWideCodePoint(codePoint) ? 2 : 1;
    if (used + characterWidth > width - 1) break;
    result += character;
    used += characterWidth;
  }
  return `${result}…`;
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
