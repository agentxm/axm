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

  it("accepts valid metadata with extensions", () => {
    const input = {
      extensions: [
        { ref: "@acme/skills/code-review" },
        { ref: "@acme/skills/lint", versionRange: "^1.0.0" },
      ],
    };

    const result = decode(input);

    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) {
      expect(result.success.extensions).toHaveLength(2);
      expect(result.success.extensions[0]).toEqual({
        ref: "@acme/skills/code-review",
      });
      expect(result.success.extensions[1]).toEqual({
        ref: "@acme/skills/lint",
        versionRange: "^1.0.0",
      });
    }
  });

  it("accepts metadata with optional $schema field", () => {
    const input = {
      $schema: "https://axm.sh/schemas/axm-package-meta.schema.json",
      extensions: [{ ref: "@acme/skills/code-review" }],
    };

    const result = decode(input);

    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) {
      expect(result.success.$schema).toBe("https://axm.sh/schemas/axm-package-meta.schema.json");
    }
  });

  it("accepts metadata without $schema field", () => {
    const input = {
      extensions: [{ ref: "@acme/skills/code-review" }],
    };

    const result = decode(input);

    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) {
      expect(result.success.$schema).toBeUndefined();
    }
  });

  it("accepts empty extensions array", () => {
    const input = {
      extensions: [],
    };

    const result = decode(input);

    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) {
      expect(result.success.extensions).toEqual([]);
    }
  });

  it("rejects invalid extensions type (string instead of array)", () => {
    const input = {
      extensions: "@acme/skills/code-review",
    };

    const result = decode(input);

    expect(Result.isFailure(result)).toBe(true);
  });

  it("rejects invalid extension ref in extensions", () => {
    const input = {
      extensions: [{ ref: "not-a-valid-ref" }],
    };

    const result = decode(input);

    expect(Result.isFailure(result)).toBe(true);
  });

  it("rejects missing extensions field", () => {
    const input = {};

    const result = decode(input);

    expect(Result.isFailure(result)).toBe(true);
  });

  it("tolerates extra fields", () => {
    const input = {
      extensions: [{ ref: "@acme/skills/code-review" }],
      extraField: "should be ignored",
      anotherExtra: 42,
    };

    const result = decode(input);

    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) {
      expect(result.success.extensions).toHaveLength(1);
    }
  });
});
