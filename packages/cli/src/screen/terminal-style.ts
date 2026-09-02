const ESC = "\u001b[";

export const ANSI_BOLD = `${ESC}1m`;
export const ANSI_DIM = `${ESC}2m`;
export const ANSI_CYAN = `${ESC}36m`;

/** Status glyphs used by screen painters and formatters. */
export const Symbols = {
  intro: "◇",
  info: "●",
  step: "◆",
} as const;
