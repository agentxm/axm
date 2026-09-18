import { describe, expect, it } from "vitest";

import { listWindow, skippedAbove } from "./list-window.js";

describe("listWindow", () => {
  it("shows a list that fits whole", () => {
    expect(listWindow(4, 3, 4)).toEqual({ start: 0, end: 4, pinned: undefined });
  });

  it("gives a line to the rows left out below", () => {
    // Five lines: three rows and the line naming the two below.
    expect(listWindow(5, 0, 4)).toEqual({ start: 0, end: 3, pinned: undefined });
  });

  it("follows the caret, naming the rows left out on both sides", () => {
    const window = listWindow(10, 5, 5);
    expect(window).toEqual({ start: 3, end: 6, pinned: undefined });
    expect(skippedAbove(window)).toBe(3);
  });

  it("ends at the last row without a line below it", () => {
    expect(listWindow(10, 9, 4)).toEqual({ start: 7, end: 10, pinned: undefined });
  });

  it("pins the caret's header above a window that scrolled past it", () => {
    const window = listWindow(10, 6, 5, () => 1);
    expect(window).toEqual({ start: 5, end: 7, pinned: 1 });
    // The pinned header is not counted among the rows left out above.
    expect(skippedAbove(window)).toBe(4);
  });

  it("does not pin a header the window still shows", () => {
    expect(listWindow(10, 3, 6, () => 1).pinned).toBeUndefined();
  });

  it("keeps the caret's row when the room is smaller than any window", () => {
    expect(listWindow(10, 6, 1)).toEqual({ start: 6, end: 7, pinned: undefined });
  });
});
