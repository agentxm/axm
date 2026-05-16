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

  it("accepts versionless cran and swift identity purls", () => {
    const cranResult = decode({ purl: "pkg:cran/tinyflags" });
    const swiftResult = decode({
      purl: "pkg:swift/example.com/agentxm/example-tinyflags-swift",
    });

    expect(Result.isSuccess(cranResult)).toBe(true);
    expect(Result.isSuccess(swiftResult)).toBe(true);
  });

  it("accepts cran and swift identity purls with matching VERS schemes", () => {
    const cranResult = decode({
      purl: "pkg:cran/tinyflags",
      versionRange: "vers:cran/>=0.1.0",
    });
    const swiftResult = decode({
      purl: "pkg:swift/example.com/agentxm/example-tinyflags-swift",
      versionRange: "vers:swift/>=0.1.0",
    });

    expect(Result.isSuccess(cranResult)).toBe(true);
    expect(Result.isSuccess(swiftResult)).toBe(true);
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

  it("rejects version-bearing companion purls", () => {
    const result = decode({ purl: "pkg:cran/tinyflags@0.1.0" });

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(String(result.failure)).toContain("identities, not pins");
    }
  });

  it("rejects unknown companion purl ecosystems", () => {
    const genericResult = decode({ purl: "pkg:generic/cran/tinyflags" });
    const bogusResult = decode({ purl: "pkg:bogus/example" });

    expect(Result.isFailure(genericResult)).toBe(true);
    expect(Result.isFailure(bogusResult)).toBe(true);
    if (Result.isFailure(genericResult)) {
      expect(String(genericResult.failure)).toContain("generic");
    }
    if (Result.isFailure(bogusResult)) {
      expect(String(bogusResult.failure)).toContain("bogus");
    }
  });
});
