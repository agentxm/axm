import type { ResolvedTableColumn } from "./cli-renderer.js";

const DEFAULT_TERMINAL_WIDTH = 80;
const COLUMN_GAP = 2;

export const getTerminalWidth = (): number => process.stdout.columns ?? DEFAULT_TERMINAL_WIDTH;

const truncate = (str: string, maxWidth: number): string => {
  if (str.length <= maxWidth) return str;
  if (maxWidth <= 1) return ".";
  return str.slice(0, maxWidth - 1) + "\u2026";
};

export const pad = (str: string, width: number, align: "left" | "right"): string => {
  if (str.length >= width) return str;
  const padding = " ".repeat(width - str.length);
  return align === "right" ? padding + str : str + padding;
};

const getWidthAt = (widths: ReadonlyArray<number>, index: number, fallback: number): number =>
  widths[index] ?? fallback;

export const formatTable = <T extends object>(
  items: ReadonlyArray<T>,
  columns: ReadonlyArray<ResolvedTableColumn<T>>,
  caption?: string,
  width: number = getTerminalWidth(),
): string => {
  if (items.length === 0 || columns.length === 0) return "";

  const availableWidth = width;

  const contentWidths: Array<number> = columns.map((col) => {
    let maxW = col.header.length;
    for (const item of items) {
      const val = col.render(item);
      if (val.length > maxW) maxW = val.length;
    }
    return maxW;
  });

  const colWidths: Array<number> = [];
  let usedWidth = 0;
  let fillCount = 0;

  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    if (col === undefined) {
      continue;
    }
    if (col.width === "fill") {
      fillCount++;
      colWidths.push(0);
    } else if (typeof col.width === "number") {
      colWidths.push(col.width);
      usedWidth += col.width;
    } else {
      const w = contentWidths[i] ?? col.header.length;
      colWidths.push(w);
      usedWidth += w;
    }
    if (i < columns.length - 1) usedWidth += COLUMN_GAP;
  }

  if (fillCount > 0) {
    const remaining = Math.max(0, availableWidth - usedWidth);
    const perFill = Math.max(4, Math.floor(remaining / fillCount));
    for (let i = 0; i < columns.length; i++) {
      if (columns[i]?.width === "fill") {
        colWidths[i] = perFill;
      }
    }
  }

  const lines: Array<string> = [];

  if (caption) {
    lines.push(caption);
  }

  const headerCells = columns.map((col, i) => {
    const colWidth = getWidthAt(colWidths, i, col.header.length);
    return pad(truncate(col.header, colWidth), colWidth, col.align);
  });
  lines.push(headerCells.join(" ".repeat(COLUMN_GAP)));

  const sepCells = columns.map((col, i) =>
    "\u2500".repeat(getWidthAt(colWidths, i, col.header.length)),
  );
  lines.push(sepCells.join(" ".repeat(COLUMN_GAP)));

  for (const item of items) {
    const cells = columns.map((col, i) => {
      const val = col.render(item);
      const colWidth = getWidthAt(colWidths, i, col.header.length);
      return pad(truncate(val, colWidth), colWidth, col.align);
    });
    lines.push(cells.join(" ".repeat(COLUMN_GAP)));
  }

  return lines.join("\n");
};
