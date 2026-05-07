import { describe, expect, it } from "vitest";
import { applyOverrides } from "./overrides.js";

describe("applyOverrides", () => {
  it("returns a copy when overrides is undefined", () => {
    const fields = { a: 1, b: 2 };
    const result = applyOverrides(fields, undefined);
    expect(result).toEqual({ a: 1, b: 2 });
    expect(result).not.toBe(fields);
  });

  it("overwrites existing fields", () => {
    const result = applyOverrides({ a: 1, b: 2 }, { a: 99 });
    expect(result).toEqual({ a: 99, b: 2 });
  });

  it("adds new fields", () => {
    const result = applyOverrides({ a: 1 }, { c: 3 });
    expect(result).toEqual({ a: 1, c: 3 });
  });

  it("removes a field when value is null", () => {
    const result = applyOverrides({ a: 1, b: 2 }, { a: null });
    expect(result).toEqual({ b: 2 });
    expect("a" in result).toBe(false);
  });

  it("null on an absent key is a no-op", () => {
    const result = applyOverrides({ a: 1 }, { missing: null });
    expect(result).toEqual({ a: 1 });
    expect("missing" in result).toBe(false);
  });

  it("mixes overwrite, add, and delete in one call", () => {
    const result = applyOverrides(
      { keep: "yes", overwrite: "old", drop: "bye" },
      { overwrite: "new", drop: null, add: "hello" },
    );
    expect(result).toEqual({ keep: "yes", overwrite: "new", add: "hello" });
  });

  it("merges nested objects and preserves existing keys", () => {
    const result = applyOverrides(
      { permissions: { read: true, write: true } },
      { permissions: { write: false } },
    );
    expect(result).toEqual({ permissions: { read: true, write: false } });
  });

  it("removes nested fields when value is null", () => {
    const result = applyOverrides(
      { permissions: { read: true, write: true } },
      { permissions: { write: null } },
    );
    expect(result).toEqual({ permissions: { read: true } });
  });

  it("null on an absent nested key is a no-op", () => {
    const result = applyOverrides(
      { permissions: { read: true } },
      { permissions: { missing: null } },
    );
    expect(result).toEqual({ permissions: { read: true } });
  });

  it("replaces arrays without concatenating or merging elements", () => {
    const result = applyOverrides(
      { tools: ["Read", "Write"], nested: { modes: [{ id: "old" }] } },
      { tools: ["Bash"], nested: { modes: [{ id: "new" }] } },
    );
    expect(result).toEqual({ tools: ["Bash"], nested: { modes: [{ id: "new" }] } });
  });

  it("replaces objects with primitives", () => {
    const result = applyOverrides({ permissions: { read: true } }, { permissions: "all" });
    expect(result).toEqual({ permissions: "all" });
  });

  it("replaces primitives with objects", () => {
    const result = applyOverrides({ permissions: "all" }, { permissions: { read: true } });
    expect(result).toEqual({ permissions: { read: true } });
  });

  it("merges deeply nested objects", () => {
    const result = applyOverrides(
      {
        config: {
          permissions: {
            filesystem: {
              read: true,
              write: true,
            },
          },
        },
      },
      {
        config: {
          permissions: {
            filesystem: {
              write: false,
            },
          },
        },
      },
    );
    expect(result).toEqual({
      config: {
        permissions: {
          filesystem: {
            read: true,
            write: false,
          },
        },
      },
    });
  });

  it("does not mutate the input", () => {
    const fields = { a: 1, nested: { keep: true } };
    applyOverrides(fields, { a: null, b: 2, nested: { add: true } });
    expect(fields).toEqual({ a: 1, nested: { keep: true } });
  });

  it("preserves falsy non-null values", () => {
    const result = applyOverrides({ a: 1 }, { a: 0, b: false, c: "" });
    expect(result).toEqual({ a: 0, b: false, c: "" });
  });
});
