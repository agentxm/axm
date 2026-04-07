/**
 * Unit tests for CommandArgumentSchema.
 */

import * as Schema from "effect/Schema";
import * as Result from "effect/Result";
import { describe, expect, it } from "vitest";
import { CommandArgumentSchema } from "./command-argument.js";

describe("CommandArgumentSchema", () => {
  const decode = Schema.decodeUnknownSync(CommandArgumentSchema);

  it("accepts minimal argument with name only", () => {
    const result = decode({ name: "path" });
    expect(result.name).toBe("path");
    expect(result.description).toBeUndefined();
    expect(result.required).toBeUndefined();
    expect(result.default).toBeUndefined();
  });

  it("accepts argument with all fields", () => {
    const input = {
      name: "output-dir",
      description: "Directory for output files",
      required: true,
      default: "./dist",
    };
    const result = decode(input);
    expect(result.name).toBe("output-dir");
    expect(result.description).toBe("Directory for output files");
    expect(result.required).toBe(true);
    expect(result.default).toBe("./dist");
  });

  it("accepts argument with required false", () => {
    const result = decode({ name: "verbose", required: false });
    expect(result.required).toBe(false);
  });

  it("rejects argument without name", () => {
    expect(() => decode({ description: "missing name" })).toThrow();
  });

  it("rejects argument with non-string name", () => {
    expect(() => decode({ name: 42 })).toThrow();
  });

  describe("synchronous decodeUnknownResult", () => {
    const decodeResult = Schema.decodeUnknownResult(CommandArgumentSchema);

    it("returns success for valid input", () => {
      const result = decodeResult({ name: "file" });
      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        expect(result.success.name).toBe("file");
      }
    });

    it("returns failure for invalid input", () => {
      const result = decodeResult({});
      expect(Result.isFailure(result)).toBe(true);
    });
  });

  describe("encode roundtrip", () => {
    const encode = Schema.encodeUnknownSync(CommandArgumentSchema);

    it("roundtrips full argument", () => {
      const input = {
        name: "target",
        description: "Build target",
        required: true,
        default: "production",
      };
      const decoded = decode(input);
      const encoded = encode(decoded);
      expect(encoded).toEqual(input);
    });

    it("roundtrips minimal argument", () => {
      const input = { name: "file" };
      const decoded = decode(input);
      const encoded = encode(decoded);
      expect(encoded).toEqual(input);
    });
  });
});
