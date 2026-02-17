import { describe, expect, it } from "vitest";
import { hasScopePrefix, parseScopedName } from "./naming.js";

describe("parseScopedName", () => {
  it("parses @scope/name into scope and name", () => {
    expect(parseScopedName("@scope/name")).toEqual({ scope: "@scope", name: "name" });
  });

  it("parses @scope/deep/name keeping everything after first slash", () => {
    expect(parseScopedName("@scope/deep/name")).toEqual({ scope: "@scope", name: "deep/name" });
  });

  it("throws on bare name without slash", () => {
    expect(() => parseScopedName("bare-name")).toThrow("Expected scoped name");
  });

  it("throws on empty string", () => {
    expect(() => parseScopedName("")).toThrow("Expected scoped name");
  });

  it("throws when slash is at position 0", () => {
    expect(() => parseScopedName("/name")).toThrow("Expected scoped name");
  });
});

describe("hasScopePrefix", () => {
  it("returns true for @scope/name", () => {
    expect(hasScopePrefix("@scope/name")).toBe(true);
  });

  it("returns false for bare name", () => {
    expect(hasScopePrefix("bare-name")).toBe(false);
  });

  it("returns false for @ without slash", () => {
    expect(hasScopePrefix("@noslash")).toBe(false);
  });
});
