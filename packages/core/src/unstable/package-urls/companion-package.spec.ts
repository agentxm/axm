import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { CompanionPackageSchema } from "./companion-package.js";

describe("CompanionPackageSchema", () => {
  const decode = Schema.decodeUnknownResult(CompanionPackageSchema);

  it("accepts an identity-only companion package", () => {
    const result = decode({ purl: "pkg:npm/example" });

    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) {
      expect(result.success.purl).toBe("pkg:npm/example");
      expect(result.success.versionRange).toBeUndefined();
    }
  });

  it("accepts a matching purl ecosystem and VERS scheme", () => {
    const result = decode({
      purl: "pkg:npm/example",
      versionRange: "vers:npm/>=1.0.0",
    });

    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) {
      expect(result.success.versionRange?.scheme).toBe("npm");
    }
  });

  it("rejects a mismatched purl ecosystem and VERS scheme", () => {
    const result = decode({
      purl: "pkg:pypi/example",
      versionRange: "vers:npm/>=1.0.0",
    });

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(String(result.failure)).toContain("pypi");
      expect(String(result.failure)).toContain("npm");
    }
  });
});
