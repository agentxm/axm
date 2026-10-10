import type { Change, Status } from "./doc.js";

/** Every symbol choice a painter needs; authored text never supplies one. */
export interface Glyphs {
  readonly outcomes: Readonly<Record<Change | Status, string>>;
  readonly marks: {
    readonly prompt: string;
    readonly caret: string;
    readonly waiting: string;
    readonly selected: string;
    readonly unselected: string;
    readonly partial: string;
  };
  readonly arrows: { readonly up: string; readonly down: string };
  /**
   * The keys a hint names by a token rather than as typed, and how the set
   * draws each: `arrows` for up and down, `sides` for left and right. This is
   * the one list of those tokens; painters and their checks read it.
   */
  readonly hintKeys: Readonly<Record<string, string>>;
  readonly spinner: ReadonlyArray<string>;
  readonly tree: {
    readonly branch: string;
    readonly last: string;
    readonly pipe: string;
    readonly space: string;
  };
  readonly separator: string;
  readonly ellipsis: string;
}

export const unicodeGlyphs: Glyphs = {
  outcomes: {
    ok: "✔",
    warn: "▲",
    error: "✖",
    info: "●",
    create: "+",
    update: "~",
    remove: "-",
    unchanged: "=",
    blocked: "▲",
    failed: "✖",
    "rolled-back": "↶",
    "not-tried": "·",
  },
  marks: {
    prompt: "?",
    caret: "❯",
    waiting: "·",
    selected: "◉",
    unselected: "◯",
    partial: "◪",
  },
  arrows: { up: "↑", down: "↓" },
  hintKeys: { arrows: "↑↓", sides: "←→" },
  spinner: ["◒", "◓"],
  tree: { branch: "├─ ", last: "└─ ", pipe: "│  ", space: "   " },
  separator: " · ",
  ellipsis: "…",
};

export const asciiGlyphs: Glyphs = {
  outcomes: {
    ok: "ok",
    warn: "!!",
    error: "xx",
    info: "..",
    create: "+",
    update: "~",
    remove: "-",
    unchanged: "=",
    blocked: "!!",
    failed: "xx",
    "rolled-back": "<",
    "not-tried": ".",
  },
  marks: {
    prompt: "?",
    caret: ">",
    waiting: ".",
    selected: "[x]",
    unselected: "[ ]",
    partial: "[-]",
  },
  arrows: { up: "^", down: "v" },
  hintKeys: { arrows: "up/down", sides: "left/right" },
  spinner: [".."],
  tree: { branch: "|- ", last: "`- ", pipe: "|  ", space: "   " },
  separator: " - ",
  ellipsis: "...",
};

/** Whether a hint's key is a token a set draws, rather than a key shown as typed. */
export const isHintKeyToken = (key: string, glyphs: Glyphs): boolean =>
  Object.hasOwn(glyphs.hintKeys, key);

/** A hint's key as the set shows it: a token's drawing, or the key as typed. */
export const hintKeyName = (key: string, glyphs: Glyphs): string =>
  isHintKeyToken(key, glyphs) ? (glyphs.hintKeys[key] ?? key) : key;
