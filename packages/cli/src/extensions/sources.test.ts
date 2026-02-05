import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { SourceSchema, type Source } from "./sources.js";

describe("extension-sources schema", () => {
  describe("SourceSchema", () => {
    it("accepts 'github' source type", () => {
      const result = Schema.decodeUnknownSync(SourceSchema)("github");
      expect(result).toBe("github");
    });

    it("accepts 'gitlab' source type", () => {
      const result = Schema.decodeUnknownSync(SourceSchema)("gitlab");
      expect(result).toBe("gitlab");
    });

    it("accepts 'bitbucket' source type", () => {
      const result = Schema.decodeUnknownSync(SourceSchema)("bitbucket");
      expect(result).toBe("bitbucket");
    });

    it("accepts 'git' source type", () => {
      const result = Schema.decodeUnknownSync(SourceSchema)("git");
      expect(result).toBe("git");
    });

    it("accepts 'registry' source type", () => {
      const result = Schema.decodeUnknownSync(SourceSchema)("registry");
      expect(result).toBe("registry");
    });

    it("accepts 'local' source type", () => {
      const result = Schema.decodeUnknownSync(SourceSchema)("local");
      expect(result).toBe("local");
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

  describe("Source", () => {
    it("type is correctly inferred as union", () => {
      // Type-level test: these should compile
      const github: Source = "github";
      const gitlab: Source = "gitlab";
      const bitbucket: Source = "bitbucket";
      const git: Source = "git";
      const registry: Source = "registry";
      const local: Source = "local";

      expect(github).toBe("github");
      expect(gitlab).toBe("gitlab");
      expect(bitbucket).toBe("bitbucket");
      expect(git).toBe("git");
      expect(registry).toBe("registry");
      expect(local).toBe("local");
    });
  });
});
