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
 * 3. With `optionalWhole`, drop `optional` columns from the right while the
 *    rest do not fit whole: a table shows an optional column at its natural
 *    width or not at all, so it never wraps a cell to keep one.
 * 4. Shrink the widest shrinkable columns toward their soft floors: the wider
 *    of the declared minimum (default: header width), the widest unbreakable
 *    word, and half the natural width (capped), so cells wrap between words
 *    onto a couple of lines at most.
 * 5. With `wrapBeforeDrop`, shrink to word floors before dropping anything:
 *    a ledger would rather wrap a cell onto another line than move its value
 *    out of the column its header names, as long as no `optional` cell needs
 *    more than three lines to fit.
 * 6. Drop the droppable priorities in turn, each from the right, refitting at
 *    soft floors after every drop. A table drops `optional` columns and then
 *    `preferred` ones; a ledger drops only `optional` ones, and what it drops
 *    is repainted beneath each row rather than lost.
 * 7. Shrink the surviving columns to their word floors (wrapping onto more
 *    lines but never splitting a word), then to their declared minimums,
 *    splitting words as a last resort.
 * 8. Stack.
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

interface GridColumn {
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
  /** Width below which the grid stacks outright; defaults to `STACKED_THRESHOLD`. */
  readonly stackBelow?: number;
  /** Priorities dropped under pressure, in order; defaults to optional then preferred. */
  readonly droppable?: ReadonlyArray<TableColumnPriority>;
  /**
   * Wrap cells onto more lines before dropping a column. A ledger's cells are
   * prose a reader has to read, so wrapping keeps each value in the column its
   * header names; dropping moves it out of the grid altogether.
   */
  readonly wrapBeforeDrop?: boolean;
  /**
   * Show an `optional` column only at its natural width. A table's optional
   * columns are extras a reader can do without, so giving one up costs less
   * than wrapping the cells a reader scans down.
   */
  readonly optionalWhole?: boolean;
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

/**
 * The width a column is laid out at before anything shrinks. A width hint
 * keeps the columns after it on a shared lane, which is worth having while the
 * values fit beside it; a protected column starts at its natural width all the
 * same, so its value gives way only once every shrinkable column has, and
 * alignment yields to information rather than the other way round.
 */
const startWidth = (column: LayoutColumn): number =>
  column.width === undefined || column.priority === "required"
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

/**
 * The most lines wrapping before a drop may give an `optional` cell. Past it,
 * a value stacked a word to a line in a narrow column is harder to read than
 * the same value painted beneath its row, so the column drops instead.
 */
const MAX_WRAPPED_LINES = 3;

const wrapsReadably = (
  columns: ReadonlyArray<LayoutColumn>,
  active: ReadonlyArray<number>,
  widths: ReadonlyArray<number>,
): boolean =>
  active.every((index, position) => {
    const column = columns[index];
    const width = widths[position] ?? 0;
    return (
      column === undefined ||
      column.priority !== "optional" ||
      width <= 0 ||
      Math.ceil(column.naturalWidth / width) <= MAX_WRAPPED_LINES
    );
  });

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
  if (available < (args.stackBelow ?? STACKED_THRESHOLD)) return { _tag: "stacked" };

  let active: ReadonlyArray<number> = all;
  if (args.optionalWhole === true) {
    let next = dropLast(columns, active, "optional");
    while (next !== undefined) {
      active = next;
      if (
        gridWidth(
          active.map((index) => natural[index] ?? 0),
          gap,
        ) <= available
      )
        return grid(
          columns,
          active,
          active.map((index) => natural[index] ?? 0),
        );
      next = dropLast(columns, active, "optional");
    }
  }
  const fitted = fit(columns, active, available, gap, softFloor);
  if (fitted !== undefined) return grid(columns, active, fitted);

  if (args.wrapBeforeDrop === true) {
    const wrappedWhole = fit(columns, active, available, gap, wordFloor);
    if (wrappedWhole !== undefined && wrapsReadably(columns, active, wrappedWhole))
      return grid(columns, active, wrappedWhole);
  }

  for (const priority of args.droppable ?? (["optional", "preferred"] as const)) {
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
