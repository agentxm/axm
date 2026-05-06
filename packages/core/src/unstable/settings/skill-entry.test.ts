import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { SkillEntryObjectSchema, SkillEntrySchema } from "./schema.js";

describe("SkillEntrySchema", () => {
  describe("decode", () => {
    it("decodes a plain string to normalized entry", () => {
      const result = Schema.decodeUnknownSync(SkillEntrySchema)("github:owner/repo");
      expect(result).toEqual({ source: "github:owner/repo", enabled: true, authored: false });
    });

    it("decodes an object with enabled false", () => {
      const result = Schema.decodeUnknownSync(SkillEntrySchema)({
        source: "github:owner/repo",
        enabled: false,
      });
      expect(result).toEqual({ source: "github:owner/repo", enabled: false, authored: false });
    });

    it("decodes an object without enabled as enabled true", () => {
      const result = Schema.decodeUnknownSync(SkillEntrySchema)({
        source: "github:owner/repo",
      });
      expect(result).toEqual({ source: "github:owner/repo", enabled: true, authored: false });
    });

    it("decodes an object with authored true", () => {
      const result = Schema.decodeUnknownSync(SkillEntrySchema)({
        source: "github:owner/repo",
        authored: true,
      });
      expect(result).toEqual({ source: "github:owner/repo", enabled: true, authored: true });
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

  describe("encode", () => {
    it("encodes enabled, non-authored entry to string", () => {
      const result = Schema.encodeSync(SkillEntrySchema)({
        source: "github:owner/repo",
        enabled: true,
        authored: false,
      });
      expect(result).toBe("github:owner/repo");
    });

    it("encodes disabled entry to object", () => {
      const result = Schema.encodeSync(SkillEntrySchema)({
        source: "github:owner/repo",
        enabled: false,
        authored: false,
      });
      expect(result).toEqual({ source: "github:owner/repo", enabled: false });
    });

    it("encodes authored entry to object", () => {
      const result = Schema.encodeSync(SkillEntrySchema)({
        source: "github:owner/repo",
        enabled: true,
        authored: true,
      });
      expect(result).toEqual({ source: "github:owner/repo", authored: true });
    });

    it("encodes disabled authored entry to object with both fields", () => {
      const result = Schema.encodeSync(SkillEntrySchema)({
        source: "github:owner/repo",
        enabled: false,
        authored: true,
      });
      expect(result).toEqual({ source: "github:owner/repo", enabled: false, authored: true });
    });
  });
});

describe("SkillEntryObjectSchema", () => {
  it("accepts object with source and enabled", () => {
    const result = Schema.decodeUnknownSync(SkillEntryObjectSchema)({
      source: "github:owner/repo",
      enabled: false,
    });
    expect(result).toEqual({ source: "github:owner/repo", enabled: false });
  });

  it("accepts object with defaults", () => {
    const result = Schema.decodeUnknownSync(SkillEntryObjectSchema)({
      source: "github:owner/repo",
    });
    expect(result).toEqual({ source: "github:owner/repo" });
  });
});
