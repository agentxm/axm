import type { TableColumnPriority } from "./doc.js";

/**
 * Responsive column layout, independent of painting.
 *
 * Given the natural width of every column and the width available for the
 * grid, the layout yields either a grid (which columns to show and at what
 * width) or a stacked fallback. The policy, in order:
 *
 * 1. The natural widths fit: show everything as is.
 * 2. Otherwise, when the available width is below the stacked threshold, stack.
 * 3. Shrink the widest shrinkable columns toward their soft floors: the wider
 *    of the declared minimum (default: header width), the widest unbreakable
 *    word, and half the natural width (capped), so cells wrap between words
 *    onto a couple of lines at most.
 * 4. Drop `optional` columns from the right, then `preferred` columns from the
 *    right, refitting at soft floors after every drop. `required` columns are
 *    never dropped.
 * 5. Shrink the surviving columns to their word floors (wrapping onto more
 *    lines but never splitting a word), then to their declared minimums,
 *    splitting words as a last resort.
 * 6. Stack.
 */

export const STACKED_THRESHOLD = 40;
const DEFAULT_MIN_WIDTH = 6;
/** Widest soft floor: prose columns may wrap more than twice once they reach it. */
const SOFT_FLOOR_CAP = 32;

export interface LayoutColumn {
  /** Display width of the header. */
  readonly headerWidth: number;
  /** Widest cell or header. */
  readonly naturalWidth: number;
  /** Widest unbreakable word across header and cells. */
  readonly wordWidth: number;
  readonly width?: number;
  readonly minWidth?: number;
  readonly priority: TableColumnPriority;
  readonly align: "left" | "right";
}

export interface GridColumn {
  /** Index into the source columns. */
  readonly index: number;
  readonly width: number;
  readonly align: "left" | "right";
}

export type TableLayout =
  | {
      readonly _tag: "grid";
      readonly columns: ReadonlyArray<GridColumn>;
      readonly hidden: ReadonlyArray<number>;
    }
  | { readonly _tag: "stacked" };

export interface LayoutTableArgs {
  readonly columns: ReadonlyArray<LayoutColumn>;
  readonly available: number | "unbounded";
  readonly gap: number;
}

const declaredFloor = (column: LayoutColumn): number =>
  Math.min(
    column.naturalWidth,
    Math.max(column.minWidth ?? Math.max(column.headerWidth, DEFAULT_MIN_WIDTH), 1),
  );

const wordFloor = (column: LayoutColumn): number =>
  Math.min(column.naturalWidth, Math.max(declaredFloor(column), column.wordWidth));

const softFloor = (column: LayoutColumn): number =>
  Math.min(
    column.naturalWidth,
    Math.max(wordFloor(column), Math.min(Math.ceil(column.naturalWidth / 2), SOFT_FLOOR_CAP)),
  );

const startWidth = (column: LayoutColumn): number =>
  column.width === undefined
    ? column.naturalWidth
    : Math.max(Math.min(column.width, column.naturalWidth), declaredFloor(column));

const gridWidth = (widths: ReadonlyArray<number>, gap: number): number =>
  widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * gap;

/**
 * Shrink the widest columns toward their floors until the grid fits or nothing
 * can shrink. Every pass takes the same amount from each column tied for the
 * widest, down to the next-widest level or the tightest floor among them, so
 * reductions are shared instead of falling on one column.
 */
const shrink = (
  widths: ReadonlyArray<number>,
  floors: ReadonlyArray<number>,
  available: number,
  gap: number,
): ReadonlyArray<number> => {
  const current = [...widths];
  let overflow = gridWidth(current, gap) - available;
  while (overflow > 0) {
    const shrinkable = current.flatMap((width, index) =>
      width > (floors[index] ?? 0) ? [index] : [],
    );
    if (shrinkable.length === 0) break;
    const widest = Math.max(...shrinkable.map((index) => current[index] ?? 0));
    const tied = shrinkable.filter((index) => current[index] === widest);
    const runnerUp = Math.max(0, ...current.filter((width) => width < widest));
    const room = Math.min(...tied.map((index) => widest - Math.max(floors[index] ?? 0, runnerUp)));
    const step = Math.max(1, Math.min(room, Math.ceil(overflow / tied.length)));
    for (const index of tied) {
      current[index] = widest - step;
      overflow -= step;
    }
  }
  return current;
};

const fit = (
  columns: ReadonlyArray<LayoutColumn>,
  active: ReadonlyArray<number>,
  available: number,
  gap: number,
  floorOf: (column: LayoutColumn) => number,
): ReadonlyArray<number> | undefined => {
  const selected = active.map((index) => columns[index]).filter((column) => column !== undefined);
  const widths = shrink(selected.map(startWidth), selected.map(floorOf), available, gap);
  return gridWidth(widths, gap) <= available ? widths : undefined;
};

const grid = (
  columns: ReadonlyArray<LayoutColumn>,
  active: ReadonlyArray<number>,
  widths: ReadonlyArray<number>,
): TableLayout => ({
  _tag: "grid",
  columns: active.map((index, position) => ({
    index,
    width: widths[position] ?? columns[index]?.naturalWidth ?? 0,
    align: columns[index]?.align ?? "left",
  })),
  hidden: columns.map((_, index) => index).filter((index) => !active.includes(index)),
});

const dropLast = (
  columns: ReadonlyArray<LayoutColumn>,
  active: ReadonlyArray<number>,
  priority: TableColumnPriority,
): ReadonlyArray<number> | undefined => {
  const candidates = active.filter((index) => columns[index]?.priority === priority);
  const last = candidates[candidates.length - 1];
  return last === undefined ? undefined : active.filter((index) => index !== last);
};

export const layoutTable = (args: LayoutTableArgs): TableLayout => {
  const { columns, available, gap } = args;
  const all = columns.map((_, index) => index);
  if (columns.length === 0) return grid(columns, all, []);
  const natural = columns.map(startWidth);
  if (available === "unbounded")
    return grid(
      columns,
      all,
      columns.map((column) => column.naturalWidth),
    );
  if (gridWidth(natural, gap) <= available) return grid(columns, all, natural);
  if (available < STACKED_THRESHOLD) return { _tag: "stacked" };

  let active: ReadonlyArray<number> = all;
  const fitted = fit(columns, active, available, gap, softFloor);
  if (fitted !== undefined) return grid(columns, active, fitted);

  for (const priority of ["optional", "preferred"] as const) {
    let next = dropLast(columns, active, priority);
    while (next !== undefined) {
      active = next;
      const refitted = fit(columns, active, available, gap, softFloor);
      if (refitted !== undefined) return grid(columns, active, refitted);
      next = dropLast(columns, active, priority);
    }
  }

  const wrapped = fit(columns, active, available, gap, wordFloor);
  if (wrapped !== undefined) return grid(columns, active, wrapped);
  const split = fit(columns, active, available, gap, declaredFloor);
  return split === undefined ? { _tag: "stacked" } : grid(columns, active, split);
};

export interface GridCell {
  /** Painted cell content for one line, formatting included. */
  readonly text: string;
  readonly width: number;
  readonly align: "left" | "right";
}

/**
 * Join one painted line of cells: every cell is padded to its column width
 * except a trailing left-aligned cell, so lines never carry trailing spaces.
 */
export const joinGridLine = (
  cells: ReadonlyArray<GridCell>,
  gap: number,
  pad: (text: string, width: number, align: "left" | "right") => string,
): string =>
  cells
    .map((cell, index) =>
      index === cells.length - 1 && cell.align === "left"
        ? cell.text
        : pad(cell.text, cell.width, cell.align),
    )
    .join(" ".repeat(gap))
    .replace(/\s+$/u, "");
