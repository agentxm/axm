import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import {
  DiscoverPackagesRequestSchema,
  DiscoverPackagesResponseSchema,
  DiscoveryExtensionResultSchema,
} from "./discover-schema.js";

describe("discover-schema", () => {
  const validExtension = {
    ref: "@acme/skills/code-review",
    source: { type: "registry", url: "https://registry.example.test" },
    resolved: true,
    extension: {
      owner: "@acme",
      type: "skill",
      name: "code-review",
      resolution: { type: "registry", version: "1.2.3" },
    },
    attestedBy: ["package", "extension"],
    official: true,
    packageVersionInRange: true,
  };

  it("accepts a resolved extension result", () => {
    const result = Schema.decodeUnknownSync(DiscoveryExtensionResultSchema)(validExtension);

    expect(result.ref).toBe("@acme/skills/code-review");
    expect(result.resolved).toBe(true);
    expect(result.extension?.resolution).toEqual({ type: "registry", version: "1.2.3" });
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
      source: { type: "registry", url: "https://registry.example.test" },
      resolved: false,
      attestedBy: ["package"],
      official: false,
      packageVersionInRange: true,
    });

    expect(result.extension).toBeUndefined();
    expect(result.resolved).toBe(false);
  });

  it.each([
    {
      label: "Registry",
      declaration: {
        ref: "@acme/skills/code-review",
        source: { type: "registry", url: "https://registry.example.test" },
        versionRange: "^1.0.0",
      },
    },
    {
      label: "Git",
      declaration: {
        ref: "@acme/skills/code-review",
        source: {
          type: "git",
          url: "https://github.com/acme/extensions.git",
          path: "skills/code-review",
          revision: "v1.2.3",
        },
      },
    },
    {
      label: "path",
      declaration: {
        ref: "@acme/skills/code-review",
        source: { type: "path", path: "extensions/code-review" },
      },
    },
  ])("accepts a normalized $label recommendation request", ({ declaration }) => {
    const result = Schema.decodeUnknownSync(DiscoverPackagesRequestSchema)({
      client: { axmVersion: "0.32.0" },
      packages: [
        {
          purl: "pkg:npm/react",
          version: "18.2.0",
          declaredExtensions: [declaration],
        },
      ],
    });

    expect(result.packages[0]?.declaredExtensions[0]?.source.type).toBe(declaration.source.type);
  });

  it.each([
    {
      source: {
        type: "git",
        url: "https://github.com/acme/extensions.git",
        path: "skills/code-review",
        revision: "v1.2.3",
      },
    },
    { source: { type: "path", path: "extensions/code-review" } },
  ])("accepts a resolved $source.type locator without a version", ({ source }) => {
    const result = Schema.decodeUnknownSync(DiscoveryExtensionResultSchema)({
      ref: "@acme/skills/code-review",
      source,
      resolved: true,
      extension: {
        owner: "@acme",
        type: "skill",
        name: "code-review",
        resolution: source,
      },
      attestedBy: ["package"],
      official: false,
      packageVersionInRange: true,
    });

    expect(result.extension?.resolution.type).toBe(source.type);
  });

  it("rejects official status for a non-Registry source", () => {
    expect(() =>
      Schema.decodeUnknownSync(DiscoveryExtensionResultSchema)({
        ref: "@acme/skills/code-review",
        source: { type: "path", path: "extensions/code-review" },
        resolved: true,
        extension: {
          owner: "@acme",
          type: "skill",
          name: "code-review",
          resolution: { type: "path", path: "extensions/code-review" },
        },
        attestedBy: ["package", "extension"],
        official: true,
        packageVersionInRange: true,
      }),
    ).toThrow();
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
