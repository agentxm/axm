import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import {
  EXTENSION_METADATA_MAX_BYTES,
  EXTENSION_METADATA_MAX_DEPTH,
  ExtensionMetadataSchema,
  extensionMetadataCompactByteLength,
  extensionMetadataContainerDepth,
} from "./manifest-metadata.js";

const metadataAtByteLength = (bytes: number) => ({
  value: "x".repeat(bytes - 12),
});

const metadataAtDepth = (depth: number): unknown => {
  let value: unknown = null;
  for (let current = 1; current < depth; current += 1) {
    value = { nested: value };
  }
  return { nested: value };
};

describe("ExtensionMetadataSchema", () => {
  const decode = Schema.decodeUnknownResult(ExtensionMetadataSchema);

  it("accepts arbitrary nested JSON objects", () => {
    const metadata = {
      "com.example/tool": {
        enabled: true,
        threshold: 1.5,
        labels: ["one", null, { nested: "✓" }],
      },
    };

    expect(decode(metadata)).toEqual(Result.succeed(metadata));
  });

  it.each([null, true, 1, "value", []])("rejects a non-object root: %j", (metadata) => {
    expect(Result.isFailure(decode(metadata))).toBe(true);
  });

  it("accepts exactly the compact UTF-8 byte limit", () => {
    const metadata = metadataAtByteLength(EXTENSION_METADATA_MAX_BYTES);

    expect(extensionMetadataCompactByteLength(metadata)).toBe(EXTENSION_METADATA_MAX_BYTES);
    expect(Result.isSuccess(decode(metadata))).toBe(true);
  });

  it("rejects the first byte beyond the compact UTF-8 byte limit", () => {
    const metadata = metadataAtByteLength(EXTENSION_METADATA_MAX_BYTES + 1);

    expect(extensionMetadataCompactByteLength(metadata)).toBe(EXTENSION_METADATA_MAX_BYTES + 1);
    const result = decode(metadata);
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(String(result.failure)).toContain("65,536 compact UTF-8 JSON bytes");
    }
  });

  it("counts multibyte Unicode from the compact UTF-8 representation", () => {
    expect(extensionMetadataCompactByteLength({ value: "✓" })).toBe(15);
  });

  it("accepts exactly the container-depth limit", () => {
    const metadata = metadataAtDepth(EXTENSION_METADATA_MAX_DEPTH);
    const result = decode(metadata);

    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) {
      expect(extensionMetadataContainerDepth(result.success)).toBe(EXTENSION_METADATA_MAX_DEPTH);
    }
  });

  it("rejects the first container beyond the depth limit", () => {
    const metadata = metadataAtDepth(EXTENSION_METADATA_MAX_DEPTH + 1);
    const result = decode(metadata);

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(String(result.failure)).toContain("container depth at most 16");
    }
  });
});
