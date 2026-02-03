import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import { SourceSchema, type SourceType } from "./extension-sources.js";

describe("extension-sources schema", () => {
  describe("SourceSchema", () => {
    it("accepts 'github' source type", () => {
      const result = Schema.decodeUnknownSync(SourceSchema)("github");
      expect(result).toBe("github");
    });

    it("accepts 'git' source type", () => {
      const result = Schema.decodeUnknownSync(SourceSchema)("git");
      expect(result).toBe("git");
    });

    it("accepts 'local' source type", () => {
      const result = Schema.decodeUnknownSync(SourceSchema)("local");
      expect(result).toBe("local");
    });

    it("accepts 'registry' source type", () => {
      const result = Schema.decodeUnknownSync(SourceSchema)("registry");
      expect(result).toBe("registry");
    });

    it("rejects invalid source type", () => {
      expect(() => Schema.decodeUnknownSync(SourceSchema)("invalid")).toThrow();
    });

    it("rejects empty string", () => {
      expect(() => Schema.decodeUnknownSync(SourceSchema)("")).toThrow();
    });

    it("rejects number", () => {
      expect(() => Schema.decodeUnknownSync(SourceSchema)(123)).toThrow();
    });

    it("rejects null", () => {
      expect(() => Schema.decodeUnknownSync(SourceSchema)(null)).toThrow();
    });
  });

  describe("SourceType", () => {
    it("type is correctly inferred as union", () => {
      // Type-level test: these should compile
      const github: SourceType = "github";
      const git: SourceType = "git";
      const local: SourceType = "local";
      const registry: SourceType = "registry";

      expect(github).toBe("github");
      expect(git).toBe("git");
      expect(local).toBe("local");
      expect(registry).toBe("registry");
    });
  });
});
