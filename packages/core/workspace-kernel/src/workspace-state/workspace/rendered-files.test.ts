/**
 * Unit tests for rendered files utilities.
 */

import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { RenderedFilePathSchema, computeSourceHash } from "./rendered-files.js";
import { SourceHashSchema } from "@agentxm/extension-model/unstable/sources/source-hash";

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
  it("decodes a workspace-relative path to a branded RenderedFilePath", () => {
    const result = Schema.decodeUnknownResult(RenderedFilePathSchema)(".claude/skills/my-skill.md");
    expect(Result.isSuccess(result)).toBe(true);
  });

  it("rejects absolute paths", () => {
    const result = Schema.decodeUnknownResult(RenderedFilePathSchema)(
      "/workspace/.claude/skills/my-skill.md",
    );
    expect(Result.isFailure(result)).toBe(true);
  });

  it("rejects escaping relative paths", () => {
    const result = Schema.decodeUnknownResult(RenderedFilePathSchema)("../outside.md");
    expect(Result.isFailure(result)).toBe(true);
  });
});
