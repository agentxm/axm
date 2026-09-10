import { describe, expect, it } from "vitest";

import { STACKED_THRESHOLD, joinGridLine, layoutTable, type LayoutColumn } from "./table-layout.js";
import { padDisplay } from "./width.js";

const column = (
  overrides: Partial<LayoutColumn> & { readonly naturalWidth: number },
): LayoutColumn => ({
  headerWidth: 4,
  wordWidth: Math.min(overrides.naturalWidth, 4),
  priority: "preferred",
  align: "left",
  ...overrides,
});

const gridWidths = (columns: ReadonlyArray<LayoutColumn>, available: number | "unbounded") => {
  const layout = layoutTable({ columns, available, gap: 3 });
  return layout._tag === "grid"
    ? { widths: layout.columns.map((entry) => entry.width), hidden: layout.hidden }
    : layout;
};

describe("layoutTable", () => {
  it("keeps natural widths when they fit", () => {
    expect(gridWidths([column({ naturalWidth: 10 }), column({ naturalWidth: 20 })], 80)).toEqual({
      widths: [10, 20],
      hidden: [],
    });
  });

  it("never wraps, truncates, or pads at an unbounded width", () => {
    expect(
      gridWidths(
        [column({ naturalWidth: 300, width: 20 }), column({ naturalWidth: 200 })],
        "unbounded",
      ),
    ).toEqual({ widths: [300, 200], hidden: [] });
  });

  it("caps a column at its width hint even when there is room", () => {
    expect(
      gridWidths([column({ naturalWidth: 60, width: 20 }), column({ naturalWidth: 10 })], 80),
    ).toEqual({ widths: [20, 10], hidden: [] });
  });

  it("shrinks the widest columns first and shares reductions between ties", () => {
    const columns = [
      column({ naturalWidth: 30, wordWidth: 10 }),
      column({ naturalWidth: 30, wordWidth: 10 }),
      column({ naturalWidth: 9, wordWidth: 9 }),
    ];
    // 30 + 30 + 9 + 6 gaps = 75 → 56 means 19 cells must go.
    expect(gridWidths(columns, 56)).toEqual({ widths: [20, 20, 9], hidden: [] });
  });

  it("stops shrinking at the widest unbreakable word before dropping columns", () => {
    const columns = [
      column({ naturalWidth: 25, wordWidth: 25, priority: "required" }),
      column({ naturalWidth: 40, wordWidth: 12 }),
      column({ naturalWidth: 60, wordWidth: 22, priority: "optional" }),
    ];
    // Shrinking to word floors gives 25 + 12 + 22 + 6 = 65, which still
    // overflows 60, so the optional column is dropped and the rest refit.
    expect(gridWidths(columns, 60)).toEqual({ widths: [25, 32], hidden: [2] });
  });

  it("drops optional columns from the right before preferred ones", () => {
    const columns = [
      column({ naturalWidth: 20, wordWidth: 20, priority: "required" }),
      column({ naturalWidth: 20, wordWidth: 20, priority: "preferred" }),
      column({ naturalWidth: 20, wordWidth: 20, priority: "optional" }),
      column({ naturalWidth: 20, wordWidth: 20, priority: "optional" }),
    ];
    expect(gridWidths(columns, 66)).toEqual({ widths: [20, 20, 20], hidden: [3] });
    expect(gridWidths(columns, 43)).toEqual({ widths: [20, 20], hidden: [2, 3] });
    expect(gridWidths(columns, 41)).toEqual({ widths: [20], hidden: [1, 2, 3] });
  });

  it("splits words in required columns before stacking", () => {
    const columns = [
      column({ naturalWidth: 50, wordWidth: 50, headerWidth: 4, priority: "required" }),
      column({ naturalWidth: 50, wordWidth: 50, headerWidth: 4, priority: "required" }),
    ];
    const layout = layoutTable({ columns, available: 60, gap: 3 });
    expect(layout._tag).toBe("grid");
    if (layout._tag === "grid") {
      expect(layout.columns.map((entry) => entry.width)).toEqual([28, 28]);
    }
  });

  it("stacks when required columns cannot fit even after splitting words", () => {
    const columns = [
      column({ naturalWidth: 50, wordWidth: 50, minWidth: 40, priority: "required" }),
      column({ naturalWidth: 50, wordWidth: 50, minWidth: 40, priority: "required" }),
    ];
    expect(layoutTable({ columns, available: 60, gap: 3 })).toEqual({ _tag: "stacked" });
  });

  it("stacks an overflowing grid below the stacked threshold but keeps a fitting one", () => {
    const wide = [column({ naturalWidth: 30 }), column({ naturalWidth: 30 })];
    const narrow = [column({ naturalWidth: 10 }), column({ naturalWidth: 10 })];
    expect(layoutTable({ columns: wide, available: STACKED_THRESHOLD - 1, gap: 3 })).toEqual({
      _tag: "stacked",
    });
    expect(gridWidths(narrow, STACKED_THRESHOLD - 1)).toEqual({ widths: [10, 10], hidden: [] });
  });
});

describe("joinGridLine", () => {
  it("pads every cell but a trailing left-aligned one and honors right alignment", () => {
    expect(
      joinGridLine(
        [
          { text: "a", width: 3, align: "left" },
          { text: "7", width: 3, align: "right" },
          { text: "z", width: 5, align: "left" },
        ],
        2,
        padDisplay,
      ),
    ).toBe("a      7  z");
    expect(
      joinGridLine(
        [
          { text: "a", width: 3, align: "left" },
          { text: "7", width: 3, align: "right" },
        ],
        2,
        padDisplay,
      ),
    ).toBe("a      7");
  });
});
