import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { PackageTypeSchema } from "./package-type.js";

describe("PackageTypeSchema", () => {
  const decode = Schema.decodeUnknownResult(PackageTypeSchema);
  const encode = Schema.encodeResult(PackageTypeSchema);

  it("applies the PackageType brand to a valid string", () => {
    const result = decode("npm");

    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) {
      expect(result.success).toBe("npm");
    }
  });

  it("round-trips through decode and encode", () => {
    const decoded = decode("pypi");

    expect(Result.isSuccess(decoded)).toBe(true);
    if (Result.isSuccess(decoded)) {
      const encoded = encode(decoded.success);
      expect(Result.isSuccess(encoded)).toBe(true);
      if (Result.isSuccess(encoded)) {
        expect(encoded.success).toBe("pypi");
      }
    }
  });

  it("accepts various package type strings", () => {
    for (const type of ["npm", "pypi", "maven", "golang", "nuget", "cargo"]) {
      const result = decode(type);
      expect(Result.isSuccess(result)).toBe(true);
    }
  });

  it("rejects non-string values", () => {
    const result = decode(123);

    expect(Result.isFailure(result)).toBe(true);
  });

  it("rejects uppercase types (canonical form is lowercase)", () => {
    expect(Result.isFailure(decode("NPM"))).toBe(true);
    expect(Result.isFailure(decode("Pypi"))).toBe(true);
  });

  it("rejects types that do not start with a letter", () => {
    expect(Result.isFailure(decode("123"))).toBe(true);
    expect(Result.isFailure(decode("-npm"))).toBe(true);
    expect(Result.isFailure(decode(".npm"))).toBe(true);
  });

  it("rejects empty strings", () => {
    expect(Result.isFailure(decode(""))).toBe(true);
  });

  it("rejects illegal characters", () => {
    expect(Result.isFailure(decode("npm pkg"))).toBe(true);
    expect(Result.isFailure(decode("npm/foo"))).toBe(true);
    expect(Result.isFailure(decode("npm@1"))).toBe(true);
  });

  it("accepts spec-permitted punctuation in the type", () => {
    expect(Result.isSuccess(decode("a.b"))).toBe(true);
    expect(Result.isSuccess(decode("a+b"))).toBe(true);
    expect(Result.isSuccess(decode("a-b"))).toBe(true);
    expect(Result.isSuccess(decode("a1"))).toBe(true);
  });
});
