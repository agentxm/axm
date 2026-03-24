import { describe, expect, it } from "vitest";
import { isPathSafe } from "./path-safety.js";

describe("isPathSafe", () => {
  it("returns true when target is within base", () => {
    expect(isPathSafe("/a/b", "/a/b/c/d")).toBe(true);
  });

  it("returns true when target equals base", () => {
    expect(isPathSafe("/a/b", "/a/b")).toBe(true);
  });

  it("returns false when target escapes via parent traversal", () => {
    expect(isPathSafe("/a/b", "/a/b/../../etc/passwd")).toBe(false);
  });

  it("returns false when target is a sibling of base", () => {
    expect(isPathSafe("/a/b", "/a/c")).toBe(false);
  });

  it("normalizes paths with . and .. segments before comparison", () => {
    expect(isPathSafe("/a/b", "/a/b/./c/../c/d")).toBe(true);
  });

  it("prevents prefix false positive (boundary check)", () => {
    expect(isPathSafe("/a/base", "/a/base-extended/file")).toBe(false);
  });

  it("returns true for deeply nested target within base", () => {
    expect(isPathSafe("/a", "/a/b/c/d/e/f")).toBe(true);
  });

  it("returns false when target is parent of base", () => {
    expect(isPathSafe("/a/b/c", "/a/b")).toBe(false);
  });
});
