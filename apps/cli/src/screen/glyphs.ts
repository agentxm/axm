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
  readonly arrows: {
    readonly up: string;
    readonly down: string;
    /** The up and down arrows as a hint names them. */
    readonly key: string;
    /** The left and right arrows as a hint names them. */
    readonly sides: string;
  };
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
  arrows: { up: "↑", down: "↓", key: "↑↓", sides: "←→" },
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
  arrows: { up: "^", down: "v", key: "up/down", sides: "left/right" },
  spinner: [".."],
  tree: { branch: "|- ", last: "`- ", pipe: "|  ", space: "   " },
  separator: " - ",
  ellipsis: "...",
};
