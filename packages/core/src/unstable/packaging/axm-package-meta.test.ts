/**
 * Unit tests for AxmPackageMetaSchema.
 *
 * Tests validation behavior for package metadata with recommended extensions.
 */

import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { AxmPackageMetaSchema } from "./axm-package-meta.js";

describe("AxmPackageMetaSchema", () => {
  const decode = Schema.decodeUnknownResult(AxmPackageMetaSchema);

  it("accepts valid metadata with recommendedExtensions", () => {
    const input = {
      recommendedExtensions: ["@acme/skills/code-review", "@acme/skills/lint@^1.0.0"],
    };

    const result = decode(input);

    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) {
      expect(result.success.recommendedExtensions).toHaveLength(2);
      expect(result.success.recommendedExtensions[0]).toBe("@acme/skills/code-review");
      expect(result.success.recommendedExtensions[1]).toBe("@acme/skills/lint@^1.0.0");
    }
  });

  it("accepts metadata with optional $schema field", () => {
    const input = {
      $schema: "https://axm.sh/schemas/axm-package-meta.schema.json",
      recommendedExtensions: ["@acme/skills/code-review"],
    };

    const result = decode(input);

    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) {
      expect(result.success.$schema).toBe("https://axm.sh/schemas/axm-package-meta.schema.json");
    }
  });

  it("accepts metadata without $schema field", () => {
    const input = {
      recommendedExtensions: ["@acme/skills/code-review"],
    };

    const result = decode(input);

    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) {
      expect(result.success.$schema).toBeUndefined();
    }
  });

  it("accepts empty recommendedExtensions array", () => {
    const input = {
      recommendedExtensions: [],
    };

    const result = decode(input);

    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) {
      expect(result.success.recommendedExtensions).toEqual([]);
    }
  });

  it("rejects invalid recommendedExtensions type (string instead of array)", () => {
    const input = {
      recommendedExtensions: "@acme/skills/code-review",
    };

    const result = decode(input);

    expect(Result.isFailure(result)).toBe(true);
  });

  it("rejects invalid extension ref in recommendedExtensions", () => {
    const input = {
      recommendedExtensions: ["not-a-valid-ref"],
    };

    const result = decode(input);

    expect(Result.isFailure(result)).toBe(true);
  });

  it("rejects missing recommendedExtensions field", () => {
    const input = {};

    const result = decode(input);

    expect(Result.isFailure(result)).toBe(true);
  });

  it("tolerates extra fields", () => {
    const input = {
      recommendedExtensions: ["@acme/skills/code-review"],
      extraField: "should be ignored",
      anotherExtra: 42,
    };

    const result = decode(input);

    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) {
      expect(result.success.recommendedExtensions).toHaveLength(1);
    }
  });
});
