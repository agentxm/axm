import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { SkillEntryObjectSchema, SkillEntrySchema, UnmanagedSkillEntrySchema } from "./schema.js";
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

    it("accepts an unmanaged entry", () => {
      const result = Schema.decodeUnknownSync(UnmanagedSkillEntrySchema)({
        managed: false,
      });

      expect(result).toEqual({ managed: false });
    });

    it("rejects invalid object", () => {
      expect(() => Schema.decodeUnknownSync(SkillEntrySchema)({ foo: "bar" })).toThrow();
    });

    it("rejects a number", () => {
      expect(() => Schema.decodeUnknownSync(SkillEntrySchema)(42)).toThrow();
    });

    it("strips extra fields from unmanaged entry", () => {
      const result = Schema.decodeUnknownSync(UnmanagedSkillEntrySchema)({
        managed: false,
        source: "x",
      });

      expect(result).toEqual({ managed: false });
    });
  });
});

describe("normalizeSkillEntry", () => {
  it("normalizes a plain string", () => {
    const result = normalizeSkillEntry("github:owner/repo");

    expect(result).toEqual({
      source: Option.some("github:owner/repo"),
      enabled: true,
      managed: true,
    });
  });

  it("normalizes an object with source and enabled false", () => {
    const result = normalizeSkillEntry({ source: "github:owner/repo", enabled: false });

    expect(result).toEqual({
      source: Option.some("github:owner/repo"),
      enabled: false,
      managed: true,
    });
  });

  it("normalizes an object with source and default enabled", () => {
    const result = normalizeSkillEntry({ source: "github:owner/repo" });

    expect(result).toEqual({
      source: Option.some("github:owner/repo"),
      enabled: true,
      managed: true,
    });
  });

  it("normalizes an unmanaged entry", () => {
    const result = normalizeSkillEntry({ managed: false });

    expect(result).toEqual({
      source: Option.none(),
      enabled: true,
      managed: false,
    });
  });
});

describe("collapseSkillEntry", () => {
  it("collapses to string when all defaults", () => {
    const result = collapseSkillEntry({
      source: Option.some("x"),
      enabled: true,
      managed: true,
    });

    expect(result).toBe("x");
  });

  it("collapses to object when enabled is false", () => {
    const result = collapseSkillEntry({
      source: Option.some("x"),
      enabled: false,
      managed: true,
    });

    expect(result).toEqual({ source: "x", enabled: false });
  });

  it("collapses unmanaged entry", () => {
    const result = collapseSkillEntry({
      source: Option.none(),
      enabled: true,
      managed: false,
    });

    expect(result).toEqual({ managed: false });
  });
});
