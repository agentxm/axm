import { plain, type Span, type Text } from "./doc.js";
import {
  displayWidth,
  takeDisplayEnd,
  takeDisplayStart,
  truncateDisplay,
  type TruncateMode,
} from "./width.js";

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

/** One piece of a painted line: its fragments, and whether a space precedes it. */
interface Chunk {
  readonly word: Word;
  /** A piece that continues the word before it, with no space between them. */
  readonly glued: boolean;
}

const attributesOf = (span: Span): Attributes => ({
  ...(span.tone === undefined ? {} : { tone: span.tone }),
  ...(span.tint === undefined ? {} : { tint: span.tint }),
  ...(span.bold === undefined ? {} : { bold: span.bold }),
  ...(span.link === undefined ? {} : { link: span.link }),
  ...(span.copyable === undefined ? {} : { copyable: span.copyable }),
  ...(span.invert === undefined ? {} : { invert: span.invert }),
});

const sameAttributes = (left: Attributes, right: Attributes): boolean =>
  left.tone === right.tone &&
  left.tint === right.tint &&
  left.bold === right.bold &&
  left.link === right.link &&
  left.copyable === right.copyable &&
  left.invert === right.invert;

/** A copyable word is one unbreakable unit: it is never split, even at a space. */
const isCopyable = (word: Word): boolean =>
  word.length > 0 && word.every((fragment) => fragment.attributes.copyable === true);

export const spansOf = (value: Text): ReadonlyArray<Span> =>
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
    if (span.copyable === true) {
      // Whole and unbroken, its own spaces included, so it stays copyable.
      flushWord();
      if (span.text.length > 0) currentLine().push([{ text: span.text, attributes }]);
      continue;
    }
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

/**
 * Where a long word may give way without losing a character: after a path
 * separator or a comma, which is where a reader's eye already stops. A word
 * broken there keeps every character and needs no hyphen, so a path list
 * wraps at its segments instead of mid-segment. A copyable value has no such
 * point: it is never broken at all.
 */
const SOFT_BREAK = /[/,]/u;

const softPieces = (word: Word): ReadonlyArray<Word> => {
  const pieces: Array<Array<Fragment>> = [];
  let piece: Array<Fragment> = [];
  let buffer = "";
  const flush = (attributes: Attributes) => {
    if (buffer.length > 0) {
      piece.push({ text: buffer, attributes });
      buffer = "";
    }
  };
  const close = () => {
    if (piece.length > 0) {
      pieces.push(piece);
      piece = [];
    }
  };
  for (const fragment of word) {
    for (const character of fragment.text) {
      buffer += character;
      if (SOFT_BREAK.test(character)) {
        flush(fragment.attributes);
        close();
      }
    }
    flush(fragment.attributes);
  }
  close();
  return pieces.length === 0 ? [word] : pieces;
};

/**
 * A word as the line takes it: whole while it fits a line at all, else its
 * soft pieces, and only then split at character boundaries.
 */
const chunksOf = (word: Word, width: number): ReadonlyArray<Chunk> => {
  if (isCopyable(word) || wordWidth(word) <= width) return [{ word, glued: false }];
  return softPieces(word).flatMap((piece, index) =>
    (wordWidth(piece) > width ? splitWord(piece, width) : [piece]).map((part, position) => ({
      word: part,
      glued: index > 0 || position > 0,
    })),
  );
};

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
): ReadonlyArray<ReadonlyArray<Chunk>> => {
  const lines: Array<Array<Chunk>> = [];
  let current: Array<Chunk> = [];
  let used = 0;
  for (const chunk of words.flatMap((word) => chunksOf(word, width))) {
    const size = wordWidth(chunk.word);
    const gap = chunk.glued ? 0 : 1;
    if (current.length === 0) {
      current = [chunk];
      used = size;
      continue;
    }
    if (used + gap + size <= width) {
      current.push(chunk);
      used += gap + size;
    } else {
      lines.push(current);
      // A piece that starts a line no longer continues anything.
      current = [{ word: chunk.word, glued: false }];
      used = size;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
};

const joinWords = (chunks: ReadonlyArray<Chunk>): ReadonlyArray<Span> => {
  const spans: Array<Span> = [];
  const push = (fragment: Fragment) => {
    const last = spans[spans.length - 1];
    if (last !== undefined && sameAttributes(attributesOf(last), fragment.attributes)) {
      spans[spans.length - 1] = { ...last, text: `${last.text}${fragment.text}` };
    } else {
      spans.push({ text: fragment.text, ...fragment.attributes });
    }
  };
  chunks.forEach((chunk, index) => {
    if (index > 0 && !chunk.glued) push({ text: " ", attributes: {} });
    for (const fragment of chunk.word) push(fragment);
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

/** Take display columns off one end of a value, keeping every span attribute. */
const takeSide = (
  spans: ReadonlyArray<Span>,
  width: number,
  side: "start" | "end",
): ReadonlyArray<Span> => {
  const ordered = side === "start" ? spans : [...spans].reverse();
  const taken: Array<Span> = [];
  let used = 0;
  for (const span of ordered) {
    const room = width - used;
    if (room <= 0) break;
    const text =
      side === "start" ? takeDisplayStart(span.text, room) : takeDisplayEnd(span.text, room);
    if (text.length === 0) break;
    taken.push({ ...span, text });
    used += displayWidth(text);
  }
  return side === "start" ? taken : taken.reverse();
};

/** Display width of the run the two values share at `side`. */
const sharedWidth = (left: string, right: string, side: "start" | "end"): number => {
  const [one, other] =
    side === "start" ? [[...left], [...right]] : [[...left].reverse(), [...right].reverse()];
  let shared = "";
  for (const [index, character] of one.entries()) {
    if (character !== other[index]) break;
    shared += character;
  }
  return displayWidth(shared);
};

/**
 * Shorten a value to `width` display columns, keeping span attributes. A
 * copyable value is returned whole: it is never cut.
 */
export const truncateText = (
  value: Text,
  width: number,
  mode: TruncateMode = "end",
  ellipsis = "…",
): Text => {
  const spans = spansOf(value);
  if (spans.some((span) => span.copyable === true)) return value;
  const rendered = plain(value);
  if (displayWidth(rendered) <= width || width <= 0) return value;
  const shortened = truncateDisplay(rendered, width, mode, ellipsis);
  const attributes = { ...spans[0], text: "" };
  // What survives is a prefix of the value, an ellipsis, and a suffix of it.
  const head = sharedWidth(shortened, rendered, "start");
  const tail = sharedWidth(shortened, rendered, "end");
  return head + displayWidth(ellipsis) + tail === displayWidth(shortened)
    ? [
        ...takeSide(spans, head, "start"),
        { ...attributes, text: ellipsis },
        ...takeSide(spans, tail, "end"),
      ]
    : // A value carrying its own ellipsis cannot be split that way; keeping it
      // as one span shows the right text rather than the right styling.
      [{ ...attributes, text: shortened }];
};

/**
 * Width of the longest unbreakable run, the floor below which wrapping starts
 * splitting words. A path list's floor is its widest segment, not the list,
 * because the list gives way at its separators.
 */
export const longestWordWidth = (value: Text): number =>
  Math.max(
    0,
    ...tokenize(spansOf(value)).flatMap((words) =>
      words.flatMap((word) =>
        (isCopyable(word) ? [word] : softPieces(word)).map((piece) => wordWidth(piece)),
      ),
    ),
  );
