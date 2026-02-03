import { describe, expect, it } from "vitest";
import { typedEntries, typedFromEntries } from "./object";

describe("typedEntries", () => {
  it("returns entries for a record", () => {
    const obj = { a: 1, b: 2, c: 3 };
    const result = typedEntries(obj);

    expect(result).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
  });

  it("returns empty array for empty object", () => {
    const obj: Record<string, number> = {};
    const result = typedEntries(obj);

    expect(result).toEqual([]);
  });

  it("preserves value types", () => {
    const obj = { name: "test", count: 42 };
    const result = typedEntries(obj);

    expect(result).toContainEqual(["name", "test"]);
    expect(result).toContainEqual(["count", 42]);
  });
});

describe("typedFromEntries", () => {
  it("creates record from entries", () => {
    const entries = [
      ["a", 1],
      ["b", 2],
    ] as const;
    const result = typedFromEntries(entries);

    expect(result).toEqual({ a: 1, b: 2 });
  });

  it("returns empty object for empty array", () => {
    const entries: readonly (readonly [string, number])[] = [];
    const result = typedFromEntries(entries);

    expect(result).toEqual({});
  });

  it("handles readonly tuples", () => {
    const entries: readonly (readonly [string, string])[] = [
      ["key1", "value1"],
      ["key2", "value2"],
    ];
    const result = typedFromEntries(entries);

    expect(result).toEqual({ key1: "value1", key2: "value2" });
  });
});

describe("round-trip", () => {
  it("typedFromEntries(typedEntries(obj)) equals obj", () => {
    const original = { x: 10, y: 20, z: 30 };
    const result = typedFromEntries(typedEntries(original));

    expect(result).toEqual(original);
  });
});
