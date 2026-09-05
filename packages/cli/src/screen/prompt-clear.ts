import { displayWidth } from "./width.js";

const ESC = "\u001b[";
const ERASE_LINE = `\r${ESC}2K`;
const CURSOR_UP = `${ESC}1A`;

const renderedRows = (text: string, columns: number): number =>
  text.split(/\r?\n/u).reduce((total, line) => {
    if (columns <= 0) return total + 1;
    return total + Math.max(1, Math.ceil(displayWidth(line) / columns));
  }, 0);

/** Erase exactly the terminal rows occupied by the previous prompt frame. */
export const erasePromptFrame = (text: string, columns: number): string => {
  const rows = renderedRows(text, columns);
  return `${ERASE_LINE}${Array.from({ length: Math.max(0, rows - 1) }, () => `${CURSOR_UP}${ERASE_LINE}`).join("")}`;
};
