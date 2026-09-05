import type { Span, Text } from "./doc.js";
import { displayWidth } from "./width.js";

/**
 * Span-aware word wrapping. Words keep their tone, bold, and link attributes
 * across line breaks, whitespace runs collapse to one space, and a hard line
 * break (`\n`) always starts a new line. A word wider than the line is split
 * at character boundaries. `"unbounded"` only honors hard breaks.
 */

type Attributes = Omit<Span, "text">;

interface Fragment {
  readonly text: string;
  readonly attributes: Attributes;
}

type Word = ReadonlyArray<Fragment>;

const attributesOf = (span: Span): Attributes => ({
  ...(span.tone === undefined ? {} : { tone: span.tone }),
  ...(span.bold === undefined ? {} : { bold: span.bold }),
  ...(span.link === undefined ? {} : { link: span.link }),
});

const sameAttributes = (left: Attributes, right: Attributes): boolean =>
  left.tone === right.tone && left.bold === right.bold && left.link === right.link;

const spansOf = (value: Text): ReadonlyArray<Span> =>
  typeof value === "string" ? [{ text: value }] : value;

const isWhitespace = (character: string): boolean => /^\s$/u.test(character);

/** Split the text into hard lines of words; each word is a run of fragments. */
const tokenize = (spans: ReadonlyArray<Span>): ReadonlyArray<ReadonlyArray<Word>> => {
  const lines: Array<Array<Word>> = [[]];
  let word: Array<Fragment> = [];
  const currentLine = (): Array<Word> => {
    const line = lines[lines.length - 1];
    if (line !== undefined) return line;
    const created: Array<Word> = [];
    lines.push(created);
    return created;
  };
  const flushWord = () => {
    if (word.length > 0) {
      currentLine().push(word);
      word = [];
    }
  };
  for (const span of spans) {
    const attributes = attributesOf(span);
    let buffer = "";
    const flushBuffer = () => {
      if (buffer.length > 0) {
        word.push({ text: buffer, attributes });
        buffer = "";
      }
    };
    for (const character of span.text) {
      if (character === "\n") {
        flushBuffer();
        flushWord();
        lines.push([]);
      } else if (isWhitespace(character)) {
        flushBuffer();
        flushWord();
      } else {
        buffer += character;
      }
    }
    flushBuffer();
  }
  flushWord();
  return lines;
};

const wordWidth = (word: Word): number =>
  word.reduce((sum, fragment) => sum + displayWidth(fragment.text), 0);

/** Split one word into pieces no wider than `width`, keeping attributes. */
const splitWord = (word: Word, width: number): ReadonlyArray<Word> => {
  const pieces: Array<Word> = [];
  let piece: Array<Fragment> = [];
  let used = 0;
  for (const fragment of word) {
    let buffer = "";
    for (const character of fragment.text) {
      const characterWidth = displayWidth(character);
      if (used + characterWidth > width && used > 0) {
        if (buffer.length > 0) piece.push({ text: buffer, attributes: fragment.attributes });
        pieces.push(piece);
        piece = [];
        buffer = "";
        used = 0;
      }
      buffer += character;
      used += characterWidth;
    }
    if (buffer.length > 0) piece.push({ text: buffer, attributes: fragment.attributes });
  }
  if (piece.length > 0) pieces.push(piece);
  return pieces;
};

const fillLines = (
  words: ReadonlyArray<Word>,
  width: number,
): ReadonlyArray<ReadonlyArray<Word>> => {
  const lines: Array<Array<Word>> = [];
  let current: Array<Word> = [];
  let used = 0;
  const pieces = words.flatMap((word) =>
    wordWidth(word) > width ? splitWord(word, width) : [word],
  );
  for (const word of pieces) {
    const size = wordWidth(word);
    if (current.length === 0) {
      current = [word];
      used = size;
      continue;
    }
    if (used + 1 + size <= width) {
      current.push(word);
      used += 1 + size;
    } else {
      lines.push(current);
      current = [word];
      used = size;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
};

const joinWords = (words: ReadonlyArray<Word>): ReadonlyArray<Span> => {
  const spans: Array<Span> = [];
  const push = (fragment: Fragment) => {
    const last = spans[spans.length - 1];
    if (last !== undefined && sameAttributes(attributesOf(last), fragment.attributes)) {
      spans[spans.length - 1] = { ...last, text: `${last.text}${fragment.text}` };
    } else {
      spans.push({ text: fragment.text, ...fragment.attributes });
    }
  };
  words.forEach((word, index) => {
    if (index > 0) push({ text: " ", attributes: {} });
    for (const fragment of word) push(fragment);
  });
  return spans;
};

const hardLines = (spans: ReadonlyArray<Span>): ReadonlyArray<ReadonlyArray<Span>> => {
  const lines: Array<Array<Span>> = [[]];
  for (const span of spans) {
    const parts = span.text.split("\n");
    parts.forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part.length === 0) return;
      const line = lines[lines.length - 1];
      if (line !== undefined) line.push({ ...span, text: part });
    });
  }
  return lines;
};

/** Wrap text into lines of spans. An empty source line yields an empty line. */
export const wrapText = (
  value: Text,
  width: number | "unbounded",
): ReadonlyArray<ReadonlyArray<Span>> => {
  const spans = spansOf(value);
  if (width === "unbounded") return hardLines(spans);
  const safeWidth = Math.max(1, width);
  return tokenize(spans).flatMap((words) =>
    words.length === 0 ? [[]] : fillLines(words, safeWidth).map(joinWords),
  );
};

/** Visible text of a value: what the terminal shows once formatting is removed. */
export const visibleText = (value: Text): string =>
  typeof value === "string" ? value : value.map((span) => span.text).join("");

/** Width of the longest unbreakable word, the floor below which wrapping splits words. */
export const longestWordWidth = (value: Text): number =>
  Math.max(0, ...tokenize(spansOf(value)).flatMap((words) => words.map((word) => wordWidth(word))));
