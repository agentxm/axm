import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { ExtensionIndexSchema, VersionEntrySchema } from "./schema.js";

describe("registry schema", () => {
  describe("VersionEntrySchema", () => {
    it("accepts valid entry with all fields", () => {
      const input = {
        version: "1.2.3",
        published: "2025-06-01T12:00:00Z",
        agents: ["claude-code", "cursor"],
        dependencies: { "@acme/utils": "^1.0.0", "@acme/core": "~2.1.0" },
        engines: { axm: ">=0.2.0" },
        checksum: "sha256:abc123def456",
      };

      const result = Schema.decodeUnknownSync(VersionEntrySchema)(input);

      expect(result.version).toBe("1.2.3");
      expect(result.published).toBe("2025-06-01T12:00:00Z");
      expect(result.agents).toEqual(["claude-code", "cursor"]);
      expect(result.dependencies).toEqual({
        "@acme/utils": "^1.0.0",
        "@acme/core": "~2.1.0",
      });
      expect(result.engines).toEqual({ axm: ">=0.2.0" });
      expect(result.checksum).toBe("sha256:abc123def456");
    });

    it("accepts valid entry with missing optional fields", () => {
      const input = {
        version: "0.1.0",
        published: "2025-01-01T00:00:00Z",
        agents: ["claude-code"],
        checksum: "sha256:deadbeef",
      };

      const result = Schema.decodeUnknownSync(VersionEntrySchema)(input);

      expect(result.version).toBe("0.1.0");
      expect(result.published).toBe("2025-01-01T00:00:00Z");
      expect(result.agents).toEqual(["claude-code"]);
      expect(result.dependencies).toBeUndefined();
      expect(result.engines).toBeUndefined();
      expect(result.checksum).toBe("sha256:deadbeef");
    });

    it("rejects missing version", () => {
      const input = {
        published: "2025-01-01T00:00:00Z",
        agents: ["claude-code"],
        checksum: "sha256:deadbeef",
      };

      expect(() => Schema.decodeUnknownSync(VersionEntrySchema)(input)).toThrow();
    });

    it("rejects missing published", () => {
      const input = {
        version: "1.0.0",
        agents: ["claude-code"],
        checksum: "sha256:deadbeef",
      };

      expect(() => Schema.decodeUnknownSync(VersionEntrySchema)(input)).toThrow();
    });

    it("rejects missing agents", () => {
      const input = {
        version: "1.0.0",
        published: "2025-01-01T00:00:00Z",
        checksum: "sha256:deadbeef",
      };

      expect(() => Schema.decodeUnknownSync(VersionEntrySchema)(input)).toThrow();
    });

    it("rejects missing checksum", () => {
      const input = {
        version: "1.0.0",
        published: "2025-01-01T00:00:00Z",
        agents: ["claude-code"],
      };

      expect(() => Schema.decodeUnknownSync(VersionEntrySchema)(input)).toThrow();
    });

    it("accepts forward-compatible unknown agent strings", () => {
      const input = {
        version: "1.0.0",
        published: "2025-01-01T00:00:00Z",
        agents: ["future-agent-2030", "another-new-agent", "claude-code"],
        checksum: "sha256:abc123",
      };

      const result = Schema.decodeUnknownSync(VersionEntrySchema)(input);

      expect(result.agents).toEqual(["future-agent-2030", "another-new-agent", "claude-code"]);
    });

    it("accepts empty agents array", () => {
      const input = {
        version: "1.0.0",
        published: "2025-01-01T00:00:00Z",
        agents: [],
        checksum: "sha256:abc123",
      };

      const result = Schema.decodeUnknownSync(VersionEntrySchema)(input);

      expect(result.agents).toEqual([]);
    });

    it("accepts empty dependencies and engines", () => {
      const input = {
        version: "1.0.0",
        published: "2025-01-01T00:00:00Z",
        agents: ["claude-code"],
        dependencies: {},
        engines: {},
        checksum: "sha256:abc123",
      };

      const result = Schema.decodeUnknownSync(VersionEntrySchema)(input);

      expect(result.dependencies).toEqual({});
      expect(result.engines).toEqual({});
    });
  });

  describe("ExtensionIndexSchema", () => {
    it("accepts valid index with required fields only", () => {
      const input = {
        name: "my-skill",
        scope: "@acme",
        type: "skill",
        versions: [
          {
            version: "1.0.0",
            published: "2025-06-01T12:00:00Z",
            agents: ["claude-code"],
            checksum: "sha256:abc123",
          },
        ],
      };

      const result = Schema.decodeUnknownSync(ExtensionIndexSchema)(input);

      expect(result.name).toBe("my-skill");
      expect(result.scope).toBe("@acme");
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
        scope: "@acme",
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
            agents: ["claude-code", "cursor"],
            dependencies: { "@acme/utils": "^1.0.0" },
            engines: { axm: ">=0.3.0" },
            checksum: "sha256:newest",
          },
          {
            version: "1.1.0",
            published: "2025-07-01T12:00:00Z",
            agents: ["claude-code"],
            dependencies: { "@acme/utils": "^1.0.0" },
            checksum: "sha256:middle",
          },
          {
            version: "1.0.0",
            published: "2025-06-01T12:00:00Z",
            agents: ["claude-code"],
            checksum: "sha256:oldest",
          },
        ],
      };

      const result = Schema.decodeUnknownSync(ExtensionIndexSchema)(input);

      expect(result.name).toBe("code-review");
      expect(result.scope).toBe("@acme");
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
        scope: "@acme",
        type: "skill",
        versions: [
          {
            version: "1.0.0",
            published: "2025-01-01T00:00:00Z",
            agents: ["claude-code"],
            checksum: "sha256:abc",
          },
        ],
      };

      expect(() => Schema.decodeUnknownSync(ExtensionIndexSchema)(input)).toThrow();
    });

    it("rejects missing scope", () => {
      const input = {
        name: "my-skill",
        type: "skill",
        versions: [
          {
            version: "1.0.0",
            published: "2025-01-01T00:00:00Z",
            agents: ["claude-code"],
            checksum: "sha256:abc",
          },
        ],
      };

      expect(() => Schema.decodeUnknownSync(ExtensionIndexSchema)(input)).toThrow();
    });

    it("rejects missing type", () => {
      const input = {
        name: "my-skill",
        scope: "@acme",
        versions: [
          {
            version: "1.0.0",
            published: "2025-01-01T00:00:00Z",
            agents: ["claude-code"],
            checksum: "sha256:abc",
          },
        ],
      };

      expect(() => Schema.decodeUnknownSync(ExtensionIndexSchema)(input)).toThrow();
    });

    it("rejects missing versions", () => {
      const input = {
        name: "my-skill",
        scope: "@acme",
        type: "skill",
      };

      expect(() => Schema.decodeUnknownSync(ExtensionIndexSchema)(input)).toThrow();
    });

    it("rejects invalid type value", () => {
      const input = {
        name: "my-skill",
        scope: "@acme",
        type: "invalid-type",
        versions: [],
      };

      expect(() => Schema.decodeUnknownSync(ExtensionIndexSchema)(input)).toThrow();
    });

    it("accepts empty versions array", () => {
      const input = {
        name: "my-skill",
        scope: "@acme",
        type: "skill",
        versions: [],
      };

      const result = Schema.decodeUnknownSync(ExtensionIndexSchema)(input);

      expect(result.versions).toEqual([]);
    });

    it("accepts type mcp-server", () => {
      const input = {
        name: "my-server",
        scope: "@acme",
        type: "mcp-server",
        versions: [],
      };

      const result = Schema.decodeUnknownSync(ExtensionIndexSchema)(input);

      expect(result.type).toBe("mcp-server");
    });

    it("accepts type pack", () => {
      const input = {
        name: "frontend-pack",
        scope: "@acme",
        type: "pack",
        versions: [],
      };

      const result = Schema.decodeUnknownSync(ExtensionIndexSchema)(input);

      expect(result.type).toBe("pack");
    });

    it("accepts authors with only required name field", () => {
      const input = {
        name: "my-skill",
        scope: "@acme",
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
