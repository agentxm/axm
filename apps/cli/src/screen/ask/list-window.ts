/**
 * Which rows of a list fit the lines it is given.
 *
 * A list that fits shows whole. One that does not shows a window that keeps
 * the caret in view, starting no later than it must, and gives a line to
 * naming the rows it leaves out above and another to those below. A row can
 * also be pinned above the window, such as the header of the group the caret
 * is in once the header has scrolled away; it takes a line of its own.
 */

export interface ListWindow {
  /** The first row the window shows. */
  readonly start: number;
  /** One past the last row the window shows. */
  readonly end: number;
  /** A row above the window shown before it, or `undefined`. */
  readonly pinned: number | undefined;
}

/**
 * The window over `count` rows that keeps `cursor` in view within `room`
 * lines. `pin` names the row to keep above a window that has scrolled past it.
 */
export const listWindow = (
  count: number,
  cursor: number,
  room: number,
  pin: (cursor: number) => number | undefined = () => undefined,
): ListWindow => {
  if (count <= 0) return { start: 0, end: 0, pinned: undefined };
  if (count <= room) return { start: 0, end: count, pinned: undefined };
  const fitted = (size: number): ListWindow & { readonly lines: number } => {
    const start = Math.min(Math.max(0, cursor - size + 1), count - size);
    const end = start + size;
    const header = pin(cursor);
    const pinned = header !== undefined && header < start ? header : undefined;
    const above = start - (pinned === undefined ? 0 : 1);
    const lines =
      size + (pinned === undefined ? 0 : 1) + (above > 0 ? 1 : 0) + (end < count ? 1 : 0);
    return { start, end, pinned, lines };
  };
  for (let size = Math.min(count, room); size > 1; size -= 1) {
    const window = fitted(size);
    if (window.lines <= room)
      return { start: window.start, end: window.end, pinned: window.pinned };
  }
  const { start, end, pinned } = fitted(1);
  return { start, end, pinned };
};

/** How many rows a window leaves out above itself, not counting a pinned row. */
export const skippedAbove = (window: ListWindow): number =>
  window.start - (window.pinned === undefined ? 0 : 1);
