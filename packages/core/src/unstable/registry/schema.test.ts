import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { ExtensionIndexSchema, VersionEntrySchema } from "./schema.js";

describe("registry schema", () => {
  describe("VersionEntrySchema", () => {
    it("accepts valid entry with all fields", () => {
      const input = {
        version: "1.2.3",
        published: "2025-06-01T12:00:00Z",
        dependencies: { "@acme/skills/utils": "^1.0.0", "@acme/skills/core": "~2.1.0" },
        integrity: "sha512-abc123def456",
      };

      const result = Schema.decodeUnknownSync(VersionEntrySchema)(input);

      expect(result.version).toBe("1.2.3");
      expect(result.published).toBe("2025-06-01T12:00:00Z");
      expect(result.dependencies).toEqual({
        "@acme/skills/utils": "^1.0.0",
        "@acme/skills/core": "~2.1.0",
      });
      expect(result.integrity).toBe("sha512-abc123def456");
    });

    it("accepts valid entry with missing optional fields", () => {
      const input = {
        version: "0.1.0",
        published: "2025-01-01T00:00:00Z",
        integrity: "sha512-deadbeef",
      };

      const result = Schema.decodeUnknownSync(VersionEntrySchema)(input);

      expect(result.version).toBe("0.1.0");
      expect(result.published).toBe("2025-01-01T00:00:00Z");
      expect(result.dependencies).toBeUndefined();
      expect(result.integrity).toBe("sha512-deadbeef");
    });

    it("rejects missing version", () => {
      const input = {
        published: "2025-01-01T00:00:00Z",
        integrity: "sha512-deadbeef",
      };

      expect(() => Schema.decodeUnknownSync(VersionEntrySchema)(input)).toThrow();
    });

    it("rejects missing published", () => {
      const input = {
        version: "1.0.0",
        integrity: "sha512-deadbeef",
      };

      expect(() => Schema.decodeUnknownSync(VersionEntrySchema)(input)).toThrow();
    });

    it("rejects missing integrity", () => {
      const input = {
        version: "1.0.0",
        published: "2025-01-01T00:00:00Z",
      };

      expect(() => Schema.decodeUnknownSync(VersionEntrySchema)(input)).toThrow();
    });

    it("accepts empty dependencies", () => {
      const input = {
        version: "1.0.0",
        published: "2025-01-01T00:00:00Z",
        dependencies: {},
        integrity: "sha512-abc123",
      };

      const result = Schema.decodeUnknownSync(VersionEntrySchema)(input);

      expect(result.dependencies).toEqual({});
    });

    it("accepts entry with packages array", () => {
      const input = {
        version: "1.0.0",
        published: "2025-01-01T00:00:00Z",
        integrity: "sha512-abc123",
        packages: [
          { purl: "pkg:npm/react", versionRange: "vers:npm/>=18.0.0|<19.0.0" },
          { purl: "pkg:pypi/django" },
        ],
      };

      const result = Schema.decodeUnknownSync(VersionEntrySchema)(input);

      expect(result.packages).toHaveLength(2);
      expect(result.packages?.[0]?.purl).toBe("pkg:npm/react");
      expect(result.packages?.[0]?.versionRange?.raw).toBe("vers:npm/>=18.0.0|<19.0.0");
      expect(result.packages?.[1]?.purl).toBe("pkg:pypi/django");
    });

    it("omits packages when absent", () => {
      const input = {
        version: "1.0.0",
        published: "2025-01-01T00:00:00Z",
        integrity: "sha512-abc123",
      };

      const result = Schema.decodeUnknownSync(VersionEntrySchema)(input);

      expect(result.packages).toBeUndefined();
    });

    it("encodes packages back to companion package objects", () => {
      const input = {
        version: "1.0.0",
        published: "2025-01-01T00:00:00Z",
        integrity: "sha512-abc123",
        packages: [{ purl: "pkg:npm/react", versionRange: "vers:npm/=18.2.0" }],
      };

      const decoded = Schema.decodeUnknownSync(VersionEntrySchema)(input);
      const encoded = Schema.encodeSync(VersionEntrySchema)(decoded);

      expect(encoded.packages).toEqual([
        { purl: "pkg:npm/react", versionRange: "vers:npm/=18.2.0" },
      ]);
    });
  });

  describe("ExtensionIndexSchema", () => {
    it("accepts valid index with required fields only", () => {
      const input = {
        name: "my-skill",
        owner: "@acme",

        publisherBindingId: "hbnd_test",
        type: "skill",
        versions: [
          {
            version: "1.0.0",
            published: "2025-06-01T12:00:00Z",
            integrity: "sha512-abc123",
          },
        ],
      };

      const result = Schema.decodeUnknownSync(ExtensionIndexSchema)(input);

      expect(result.name).toBe("my-skill");
      expect(result.owner).toBe("@acme");
      expect(result.type).toBe("skill");
      expect(result.versions).toHaveLength(1);
      expect(result.description).toBeUndefined();
      expect(result.repository).toBeUndefined();
      expect(result.license).toBeUndefined();
      expect(result.authors).toBeUndefined();
    });

    it("accepts valid index with all fields including multiple versions", () => {
      const input = {
        name: "code-review",
        owner: "@acme",

        publisherBindingId: "hbnd_test",
        type: "mcp-server",
        description: "Automated code review tool",
        repository: "https://github.com/acme/code-review",
        license: "MIT",
        authors: [
          { name: "Alice", email: "alice@acme.com", url: "https://alice.dev" },
          { name: "Bob" },
        ],
        versions: [
          {
            version: "2.0.0",
            published: "2025-08-01T12:00:00Z",
            dependencies: { "@acme/skills/utils": "^1.0.0" },
            integrity: "sha512-newest",
          },
          {
            version: "1.1.0",
            published: "2025-07-01T12:00:00Z",
            dependencies: { "@acme/skills/utils": "^1.0.0" },
            integrity: "sha512-middle",
          },
          {
            version: "1.0.0",
            published: "2025-06-01T12:00:00Z",
            integrity: "sha512-oldest",
          },
        ],
      };

      const result = Schema.decodeUnknownSync(ExtensionIndexSchema)(input);

      expect(result.name).toBe("code-review");
      expect(result.owner).toBe("@acme");
      expect(result.type).toBe("mcp-server");
      expect(result.description).toBe("Automated code review tool");
      expect(result.repository).toBe("https://github.com/acme/code-review");
      expect(result.license).toBe("MIT");
      expect(result.authors).toHaveLength(2);
      expect(result.versions).toHaveLength(3);
      expect(result.versions[0]?.version).toBe("2.0.0");
      expect(result.versions[1]?.version).toBe("1.1.0");
      expect(result.versions[2]?.version).toBe("1.0.0");
    });

    it("rejects missing name", () => {
      const input = {
        owner: "@acme",

        publisherBindingId: "hbnd_test",
        type: "skill",
        versions: [
          {
            version: "1.0.0",
            published: "2025-01-01T00:00:00Z",
            integrity: "sha512-abc",
          },
        ],
      };

      expect(() => Schema.decodeUnknownSync(ExtensionIndexSchema)(input)).toThrow();
    });

    it("rejects missing owner", () => {
      const input = {
        name: "my-skill",
        type: "skill",
        versions: [
          {
            version: "1.0.0",
            published: "2025-01-01T00:00:00Z",
            integrity: "sha512-abc",
          },
        ],
      };

      expect(() => Schema.decodeUnknownSync(ExtensionIndexSchema)(input)).toThrow();
    });

    it("rejects missing type", () => {
      const input = {
        name: "my-skill",
        owner: "@acme",

        publisherBindingId: "hbnd_test",
        versions: [
          {
            version: "1.0.0",
            published: "2025-01-01T00:00:00Z",
            integrity: "sha512-abc",
          },
        ],
      };

      expect(() => Schema.decodeUnknownSync(ExtensionIndexSchema)(input)).toThrow();
    });

    it("rejects missing versions", () => {
      const input = {
        name: "my-skill",
        owner: "@acme",

        publisherBindingId: "hbnd_test",
        type: "skill",
      };

      expect(() => Schema.decodeUnknownSync(ExtensionIndexSchema)(input)).toThrow();
    });

    it("rejects invalid type value", () => {
      const input = {
        name: "my-skill",
        owner: "@acme",

        publisherBindingId: "hbnd_test",
        type: "invalid-type",
        versions: [],
      };

      expect(() => Schema.decodeUnknownSync(ExtensionIndexSchema)(input)).toThrow();
    });

    it("accepts empty versions array", () => {
      const input = {
        name: "my-skill",
        owner: "@acme",

        publisherBindingId: "hbnd_test",
        type: "skill",
        versions: [],
      };

      const result = Schema.decodeUnknownSync(ExtensionIndexSchema)(input);

      expect(result.versions).toEqual([]);
    });

    it("accepts type mcp-server", () => {
      const input = {
        name: "my-server",
        owner: "@acme",

        publisherBindingId: "hbnd_test",
        type: "mcp-server",
        versions: [],
      };

      const result = Schema.decodeUnknownSync(ExtensionIndexSchema)(input);

      expect(result.type).toBe("mcp-server");
    });

    it("accepts type pack", () => {
      const input = {
        name: "frontend-pack",
        owner: "@acme",

        publisherBindingId: "hbnd_test",
        type: "pack",
        versions: [],
      };

      const result = Schema.decodeUnknownSync(ExtensionIndexSchema)(input);

      expect(result.type).toBe("pack");
    });

    it("accepts authors with only required name field", () => {
      const input = {
        name: "my-skill",
        owner: "@acme",

        publisherBindingId: "hbnd_test",
        type: "skill",
        authors: [{ name: "Alice" }],
        versions: [],
      };

      const result = Schema.decodeUnknownSync(ExtensionIndexSchema)(input);

      expect(result.authors).toHaveLength(1);
      expect(result.authors?.[0]?.name).toBe("Alice");
    });
  });
});
