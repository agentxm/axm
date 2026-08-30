import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import {
  DiscoverPackagesResponseSchema,
  DiscoveryExtensionResultSchema,
} from "./discover-schema.js";

describe("discover-schema", () => {
  const validExtension = {
    ref: "@acme/skills/code-review",
    resolved: true,
    extension: {
      owner: "@acme",
      type: "skill",
      name: "code-review",
      installVersion: "1.2.3",
    },
    attestedBy: ["package", "extension"],
    official: true,
    packageVersionInRange: true,
  };

  it("accepts a resolved extension result", () => {
    const result = Schema.decodeUnknownSync(DiscoveryExtensionResultSchema)(validExtension);

    expect(result.ref).toBe("@acme/skills/code-review");
    expect(result.resolved).toBe(true);
    expect(result.extension?.installVersion).toBe("1.2.3");
    expect(result.official).toBe(true);
  });

  it("accepts registry plural extension type segments", () => {
    const result = Schema.decodeUnknownSync(DiscoveryExtensionResultSchema)({
      ...validExtension,
      extension: {
        ...validExtension.extension,
        type: "skills",
      },
    });

    expect(result.extension?.type).toBe("skills");
  });

  it("accepts registry owner slugs", () => {
    const result = Schema.decodeUnknownSync(DiscoveryExtensionResultSchema)({
      ...validExtension,
      extension: {
        ...validExtension.extension,
        owner: "acme",
      },
    });

    expect(result.extension?.owner).toBe("acme");
  });

  it("accepts an unresolved extension ref", () => {
    const result = Schema.decodeUnknownSync(DiscoveryExtensionResultSchema)({
      ref: "@acme/skills/missing",
      resolved: false,
      attestedBy: ["package"],
      official: false,
      packageVersionInRange: true,
    });

    expect(result.extension).toBeUndefined();
    expect(result.resolved).toBe(false);
  });

  it("rejects invalid attestation values", () => {
    expect(() =>
      Schema.decodeUnknownSync(DiscoveryExtensionResultSchema)({
        ...validExtension,
        attestedBy: ["recommended"],
      }),
    ).toThrow();
  });

  it("accepts a discovery response", () => {
    const response = {
      results: [
        {
          purl: "pkg:npm/react",
          version: "18.2.0",
          status: "resolved",
          extensions: [validExtension],
        },
      ],
    };

    const result = Schema.decodeUnknownSync(DiscoverPackagesResponseSchema)(response);

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.extensions[0]?.official).toBe(true);
  });

  it("roundtrips through encode/decode", () => {
    const response = {
      results: [
        {
          purl: "pkg:npm/react",
          version: "18.2.0",
          status: "resolved",
          extensions: [validExtension],
        },
      ],
    };
    const decoded = Schema.decodeUnknownSync(DiscoverPackagesResponseSchema)(response);
    const encoded = Schema.encodeSync(DiscoverPackagesResponseSchema)(decoded);
    const reDecoded = Schema.decodeUnknownSync(DiscoverPackagesResponseSchema)(encoded);

    expect(reDecoded).toEqual(decoded);
  });

  it("rejects missing results field", () => {
    expect(() => Schema.decodeUnknownSync(DiscoverPackagesResponseSchema)({})).toThrow();
  });
});
