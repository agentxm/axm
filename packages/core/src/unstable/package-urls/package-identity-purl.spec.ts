import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";
import { describe, expect, it } from "vitest";
import { PackageIdentityPurlSchema } from "./package-identity-purl.js";

describe("PackageIdentityPurlSchema", () => {
  const decode = Schema.decodeUnknownResult(PackageIdentityPurlSchema);

  it("decodes a bare purl", () => {
    const result = decode("pkg:npm/example");

    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) {
      expect(result.success).toBe("pkg:npm/example");
    }
  });

  it("rejects a purl with an @version and points authors to versionRange", () => {
    const result = decode("pkg:npm/example@1.2.3");

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(String(result.failure)).toContain("Companion package purls are identities");
      expect(String(result.failure)).toContain("versionRange");
    }

    const annotations = SchemaAST.resolve(PackageIdentityPurlSchema.ast);
    expect(annotations?.["description"]).toContain("versionRange");
  });

  it("preserves namespace while rejecting only the version segment", () => {
    const result = decode("pkg:npm/%40scope/example");

    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) {
      expect(result.success).toBe("pkg:npm/%40scope/example");
    }
  });
});
