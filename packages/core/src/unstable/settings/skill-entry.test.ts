import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { SkillEntryObjectSchema, SkillEntrySchema } from "./schema.js";
import { collapseSkillEntry, normalizeSkillEntry } from "./skill-entry.js";

describe("SkillEntrySchema", () => {
  describe("parsing", () => {
    it("accepts a plain string", () => {
      const result = Schema.decodeUnknownSync(SkillEntrySchema)("github:owner/repo");

      expect(result).toBe("github:owner/repo");
    });

    it("accepts a SkillEntryObject with source and enabled", () => {
      const result = Schema.decodeUnknownSync(SkillEntryObjectSchema)({
        source: "github:owner/repo",
        enabled: false,
      });

      expect(result).toEqual({ source: "github:owner/repo", enabled: false });
    });

    it("accepts a SkillEntryObject with defaults", () => {
      const result = Schema.decodeUnknownSync(SkillEntryObjectSchema)({
        source: "github:owner/repo",
      });

      expect(result).toEqual({ source: "github:owner/repo" });
    });

    it("rejects { managed: false } (legacy unmanaged marker)", () => {
      expect(() => Schema.decodeUnknownSync(SkillEntrySchema)({ managed: false })).toThrow();
    });

    it("rejects invalid object", () => {
      expect(() => Schema.decodeUnknownSync(SkillEntrySchema)({ foo: "bar" })).toThrow();
    });

    it("rejects a number", () => {
      expect(() => Schema.decodeUnknownSync(SkillEntrySchema)(42)).toThrow();
    });
  });
});

describe("normalizeSkillEntry", () => {
  it("normalizes a plain string", () => {
    const result = normalizeSkillEntry("github:owner/repo");

    expect(result).toEqual({
      source: "github:owner/repo",
      enabled: true,
    });
  });

  it("normalizes an object with source and enabled false", () => {
    const result = normalizeSkillEntry({ source: "github:owner/repo", enabled: false });

    expect(result).toEqual({
      source: "github:owner/repo",
      enabled: false,
    });
  });

  it("normalizes an object with source and default enabled", () => {
    const result = normalizeSkillEntry({ source: "github:owner/repo" });

    expect(result).toEqual({
      source: "github:owner/repo",
      enabled: true,
    });
  });
});

describe("collapseSkillEntry", () => {
  it("collapses to string when enabled is true (default)", () => {
    const result = collapseSkillEntry({
      source: "x",
      enabled: true,
    });

    expect(result).toBe("x");
  });

  it("collapses to object when enabled is false", () => {
    const result = collapseSkillEntry({
      source: "x",
      enabled: false,
    });

    expect(result).toEqual({ source: "x", enabled: false });
  });
});
