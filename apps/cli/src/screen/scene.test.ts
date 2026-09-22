import { describe, expect, it } from "vitest";

import type { Doc } from "./doc.js";
import { paintScene, type SceneFacts, type ScenePart } from "./scene.js";
import { displayWidth } from "./width.js";

const style = { colors: false, spinner: "◒", nowMs: 0 };

/** A part that asks for `count` lines, each naming the part it belongs to. */
const part =
  (label: string, count: number): ScenePart =>
  () => [
    {
      _tag: "raw",
      content: Array.from({ length: count }, (_, index) => `${label} ${String(index + 1)}`).join(
        "\n",
      ),
    },
  ];

describe("the live scene", () => {
  it("is empty when neither part is set", () => {
    expect(paintScene({}, { columns: 80, rows: 24 }, style)).toEqual([]);
  });

  it("holds the activity within the terminal height less two rows", () => {
    const lines = paintScene({ activity: part("row", 40) }, { columns: 80, rows: 16 }, style);
    expect(lines).toHaveLength(14);
    expect(lines[0]).toBe("row 1");
  });

  it("gives the foreground question the available height", () => {
    expect(
      paintScene(
        { activity: part("activity", 40), interaction: part("ask", 8) },
        { columns: 80, rows: 8 },
        style,
      ),
    ).toEqual(["ask 1", "ask 2", "ask 3", "ask 4", "ask 5", "ask 6"]);
  });

  it("tells each part the space it may use", () => {
    const seen: Array<SceneFacts> = [];
    const record =
      (label: string): ScenePart =>
      (facts) => {
        seen.push(facts);
        return part(label, 3)(facts);
      };
    paintScene(
      { activity: record("row"), interaction: record("ask") },
      { columns: 80, rows: 16 },
      style,
    );
    // Only the foreground interaction is laid out.
    expect(seen).toEqual([{ columns: 79, rows: 14, spinner: "◒", nowMs: 0 }]);
  });

  it("cuts a line that would reach the last column", () => {
    const wide: Doc = [{ _tag: "raw", content: "x".repeat(200) }];
    const lines = paintScene({ activity: () => wide }, { columns: 80, rows: 24 }, style);
    expect(displayWidth(lines[0] ?? "")).toBe(79);
    expect(lines[0]?.endsWith("…")).toBe(true);
  });

  it("cuts a part that asks for more rows than it was given", () => {
    const greedy: ScenePart = (facts) => part("row", facts.rows + 5)(facts);
    expect(paintScene({ activity: greedy }, { columns: 80, rows: 10 }, style)).toHaveLength(8);
  });
});
