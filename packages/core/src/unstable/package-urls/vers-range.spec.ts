import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { VersRangeSchema } from "./vers-range.js";

describe("VersRangeSchema", () => {
  const decode = Schema.decodeUnknownResult(VersRangeSchema);

  it("decodes a well-formed VERS range with scheme and constraints", () => {
    const result = decode("vers:npm/>=1.0.0|<2.0.0");

    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) {
      expect(result.success.raw).toBe("vers:npm/>=1.0.0|<2.0.0");
      expect(result.success.scheme).toBe("npm");
      expect(result.success.constraints).toEqual([
        { comparator: ">=", version: "1.0.0" },
        { comparator: "<", version: "2.0.0" },
      ]);
    }
  });

  it("rejects an empty constraint list", () => {
    const result = decode("vers:npm/");

    expect(Result.isFailure(result)).toBe(true);
  });

  it("rejects a missing vers prefix", () => {
    const result = decode(">=1.0.0|<2.0.0");

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(String(result.failure)).toContain("vers:");
    }
  });

  it("rejects sentinel schemes", () => {
    const result = decode("vers:semver/>=1.0.0");

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(String(result.failure)).toContain("semver");
      expect(String(result.failure)).toContain("generic schemes");
    }
  });

  it("accepts concrete ecosystem schemes", () => {
    const result = decode("vers:pypi/>=1.0.0");

    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) {
      expect(result.success.scheme).toBe("pypi");
    }
  });

  it("rejects wildcard-only ranges", () => {
    const result = decode("vers:npm/*");

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(String(result.failure)).toContain("omit versionRange");
    }
  });

  it("rejects percent-encoded values", () => {
    const result = decode("vers:npm/%3E%3D1.0.0");

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(String(result.failure)).toContain("percent-encoded");
    }
  });
});
