/**
 * Unit tests for rendered files utilities.
 */

import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import {
  RenderedFilesMapSchema,
  RenderedFilePathSchema,
  SourceHashSchema,
  computeSourceHash,
} from "./rendered-files.js";

describe("computeSourceHash", () => {
  it("returns the same hash for the same content", () => {
    const hash1 = computeSourceHash("hello world");
    const hash2 = computeSourceHash("hello world");
    expect(hash1).toBe(hash2);
  });

  it("returns different hashes for different content", () => {
    const hash1 = computeSourceHash("hello world");
    const hash2 = computeSourceHash("hello world!");
    expect(hash1).not.toBe(hash2);
  });

  it("returns a string value", () => {
    const hash = computeSourceHash("test");
    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(0);
  });

  it("handles empty string input", () => {
    const hash = computeSourceHash("");
    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(0);
  });

  it("is sensitive to whitespace changes", () => {
    const hash1 = computeSourceHash("hello world");
    const hash2 = computeSourceHash("hello  world");
    expect(hash1).not.toBe(hash2);
  });

  it("accepts arbitrary content (not just command-shaped inputs)", () => {
    const hash = computeSourceHash(JSON.stringify({ key: "value", nested: [1, 2, 3] }));
    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(0);
  });
});

describe("SourceHashSchema", () => {
  it("decodes a valid string to a branded SourceHash", () => {
    const result = Schema.decodeUnknownResult(SourceHashSchema)("abc123");
    expect(Result.isSuccess(result)).toBe(true);
  });

  it("rejects non-string values", () => {
    const result = Schema.decodeUnknownResult(SourceHashSchema)(42);
    expect(Result.isFailure(result)).toBe(true);
  });
});

describe("RenderedFilePathSchema", () => {
  it("decodes a valid string to a branded RenderedFilePath", () => {
    const result = Schema.decodeUnknownResult(RenderedFilePathSchema)(".claude/skills/my-skill.md");
    expect(Result.isSuccess(result)).toBe(true);
  });
});

describe("RenderedFilesMapSchema", () => {
  it("decodes a valid map structure", () => {
    const input = {
      "claude-code": [{ path: ".claude/skills/my-skill.md" }],
      cursor: [{ path: ".cursor/skills/my-skill.md" }],
    };
    const result = Schema.decodeUnknownResult(RenderedFilesMapSchema)(input);
    expect(Result.isSuccess(result)).toBe(true);
  });

  it("decodes an empty map", () => {
    const result = Schema.decodeUnknownResult(RenderedFilesMapSchema)({});
    expect(Result.isSuccess(result)).toBe(true);
  });

  it("roundtrips through encode/decode", () => {
    const input = {
      "claude-code": [{ path: ".claude/skills/my-skill.md" }],
    };
    const decoded = Schema.decodeUnknownResult(RenderedFilesMapSchema)(input);
    expect(Result.isSuccess(decoded)).toBe(true);
    if (Result.isSuccess(decoded)) {
      const encoded = Schema.encodeUnknownResult(RenderedFilesMapSchema)(decoded.success);
      expect(Result.isSuccess(encoded)).toBe(true);
      if (Result.isSuccess(encoded)) {
        expect(encoded.success).toEqual(input);
      }
    }
  });

  it("rejects invalid structure", () => {
    const result = Schema.decodeUnknownResult(RenderedFilesMapSchema)("not-a-record");
    expect(Result.isFailure(result)).toBe(true);
  });

  it("rejects entries missing the path field", () => {
    const input = {
      "claude-code": [{ notPath: "something" }],
    };
    const result = Schema.decodeUnknownResult(RenderedFilesMapSchema)(input);
    expect(Result.isFailure(result)).toBe(true);
  });
});
