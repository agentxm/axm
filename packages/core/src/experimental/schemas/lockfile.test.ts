import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import {
  ExtensionLockMapSchema,
  ExtensionsByTypeSchema,
  LockEntrySchema,
  LockfileSchema,
} from "./lockfile";

describe("lockfile schema", () => {
  describe("Lockfile", () => {
    it("accepts valid minimal lockfile", () => {
      const input = {
        lockfileVersion: 1,
        extensions: {},
      };

      const result = Schema.decodeUnknownSync(LockfileSchema)(input);

      expect(result.lockfileVersion).toBe(1);
      expect(result.extensions).toEqual({});
    });

    it("rejects missing lockfileVersion", () => {
      const input = {
        extensions: {},
      };

      expect(() => Schema.decodeUnknownSync(LockfileSchema)(input)).toThrow();
    });

    it("accepts valid skill lock entry", () => {
      const input = {
        lockfileVersion: 1,
        extensions: {
          skills: {
            "@wayne/grappling-hook": {
              source: "github:wayne-industries/skills",
              origin: "https://github.com/wayne-industries/skills",
              path: "skills/grappling-hook",
              ref: "main",
              folderHash: "abc123def456",
              installedAt: "2025-01-15T10:30:00Z",
              updatedAt: "2025-01-15T10:30:00Z",
            },
          },
        },
      };

      const result = Schema.decodeUnknownSync(LockfileSchema)(input);

      expect(result.lockfileVersion).toBe(1);
      expect(result.extensions.skills?.["@wayne/grappling-hook"]).toBeDefined();
      expect(result.extensions.skills?.["@wayne/grappling-hook"]?.source).toBe(
        "github:wayne-industries/skills",
      );
      expect(result.extensions.skills?.["@wayne/grappling-hook"]?.path).toBe(
        "skills/grappling-hook",
      );
    });

    it("accepts valid pack lock entry with dependencies", () => {
      const input = {
        lockfileVersion: 1,
        extensions: {
          packs: {
            "@wayne/batpack": {
              source: "github:wayne-industries/packs",
              origin: "https://github.com/wayne-industries/packs",
              folderHash: "def456abc123",
              dependencies: ["@wayne/skill-a", "@wayne/skill-b"],
              installedAt: "2025-01-15T10:30:00Z",
              updatedAt: "2025-01-15T10:30:00Z",
            },
          },
        },
      };

      const result = Schema.decodeUnknownSync(LockfileSchema)(input);

      expect(result.extensions.packs?.["@wayne/batpack"]?.dependencies).toEqual([
        "@wayne/skill-a",
        "@wayne/skill-b",
      ]);
    });

    it("rejects invalid extension name without @scope/", () => {
      const input = {
        lockfileVersion: 1,
        extensions: {
          skills: {
            "grappling-hook": {
              source: "github:wayne-industries/skills",
              origin: "https://github.com/wayne-industries/skills",
              folderHash: "abc123def456",
              installedAt: "2025-01-15T10:30:00Z",
              updatedAt: "2025-01-15T10:30:00Z",
            },
          },
        },
      };

      expect(() => Schema.decodeUnknownSync(LockfileSchema)(input)).toThrow();
    });

    it("accepts lockfile with multiple extension types", () => {
      const input = {
        lockfileVersion: 1,
        extensions: {
          skills: {
            "@wayne/grappling-hook": {
              source: "github:wayne-industries/skills",
              origin: "https://github.com/wayne-industries/skills",
              folderHash: "abc123",
              installedAt: "2025-01-15T10:30:00Z",
              updatedAt: "2025-01-15T10:30:00Z",
            },
          },
          commands: {
            "@wayne/build": {
              source: "github:wayne-industries/commands",
              origin: "https://github.com/wayne-industries/commands",
              folderHash: "def456",
              installedAt: "2025-01-15T11:00:00Z",
              updatedAt: "2025-01-15T11:00:00Z",
            },
          },
          "mcp-servers": {
            "@wayne/batcomputer": {
              source: "github:wayne-industries/mcp-servers",
              origin: "https://github.com/wayne-industries/mcp-servers",
              folderHash: "ghi789",
              installedAt: "2025-01-15T12:00:00Z",
              updatedAt: "2025-01-15T12:00:00Z",
            },
          },
        },
      };

      const result = Schema.decodeUnknownSync(LockfileSchema)(input);

      expect(result.extensions.skills?.["@wayne/grappling-hook"]).toBeDefined();
      expect(result.extensions.commands?.["@wayne/build"]).toBeDefined();
      expect(result.extensions["mcp-servers"]?.["@wayne/batcomputer"]).toBeDefined();
    });
  });

  describe("LockEntry", () => {
    it("accepts valid lock entry with required fields only", () => {
      const input = {
        source: "github:example/repo",
        origin: "https://github.com/example/repo",
        folderHash: "abc123",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      const result = Schema.decodeUnknownSync(LockEntrySchema)(input);

      expect(result.source).toBe("github:example/repo");
      expect(result.origin).toBe("https://github.com/example/repo");
      expect(result.folderHash).toBe("abc123");
      expect(result.installedAt).toBe("2025-01-15T10:30:00Z");
      expect(result.updatedAt).toBe("2025-01-15T10:30:00Z");
    });

    it("accepts valid lock entry with all optional fields", () => {
      const input = {
        source: "github:example/repo",
        origin: "https://github.com/example/repo",
        path: "skills/my-skill",
        ref: "v1.0.0",
        version: "1.0.0",
        folderHash: "abc123",
        dependencies: ["@example/dep-a", "@example/dep-b"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-16T14:00:00Z",
      };

      const result = Schema.decodeUnknownSync(LockEntrySchema)(input);

      expect(result.path).toBe("skills/my-skill");
      expect(result.ref).toBe("v1.0.0");
      expect(result.version).toBe("1.0.0");
      expect(result.dependencies).toEqual(["@example/dep-a", "@example/dep-b"]);
    });

    it("rejects lock entry missing source", () => {
      const input = {
        origin: "https://github.com/example/repo",
        folderHash: "abc123",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(LockEntrySchema)(input)).toThrow();
    });

    it("rejects lock entry missing origin", () => {
      const input = {
        source: "github:example/repo",
        folderHash: "abc123",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(LockEntrySchema)(input)).toThrow();
    });

    it("rejects lock entry missing folderHash", () => {
      const input = {
        source: "github:example/repo",
        origin: "https://github.com/example/repo",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(LockEntrySchema)(input)).toThrow();
    });

    it("rejects lock entry missing installedAt", () => {
      const input = {
        source: "github:example/repo",
        origin: "https://github.com/example/repo",
        folderHash: "abc123",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(LockEntrySchema)(input)).toThrow();
    });

    it("rejects lock entry missing updatedAt", () => {
      const input = {
        source: "github:example/repo",
        origin: "https://github.com/example/repo",
        folderHash: "abc123",
        installedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(LockEntrySchema)(input)).toThrow();
    });

    it("rejects invalid dependency names", () => {
      const input = {
        source: "github:example/repo",
        origin: "https://github.com/example/repo",
        folderHash: "abc123",
        dependencies: ["invalid-dep"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(LockEntrySchema)(input)).toThrow();
    });
  });

  describe("ExtensionsByType", () => {
    it("accepts empty extensions object", () => {
      const input = {};

      const result = Schema.decodeUnknownSync(ExtensionsByTypeSchema)(input);

      expect(result).toEqual({});
    });

    it("accepts all extension types", () => {
      const lockEntry = {
        source: "github:example/repo",
        origin: "https://github.com/example/repo",
        folderHash: "abc123",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      const input = {
        skills: { "@example/skill": lockEntry },
        commands: { "@example/command": lockEntry },
        packs: { "@example/pack": lockEntry },
        "mcp-servers": { "@example/mcp": lockEntry },
      };

      const result = Schema.decodeUnknownSync(ExtensionsByTypeSchema)(input);

      expect(result.skills?.["@example/skill"]).toBeDefined();
      expect(result.commands?.["@example/command"]).toBeDefined();
      expect(result.packs?.["@example/pack"]).toBeDefined();
      expect(result["mcp-servers"]?.["@example/mcp"]).toBeDefined();
    });
  });

  describe("ExtensionLockMap", () => {
    it("accepts valid map with FQN keys", () => {
      const input = {
        "@scope/name": {
          source: "github:example/repo",
          origin: "https://github.com/example/repo",
          folderHash: "abc123",
          installedAt: "2025-01-15T10:30:00Z",
          updatedAt: "2025-01-15T10:30:00Z",
        },
      };

      const result = Schema.decodeUnknownSync(ExtensionLockMapSchema)(input);

      expect(result["@scope/name"]).toBeDefined();
    });

    it("rejects map with invalid FQN keys", () => {
      const input = {
        "invalid-key": {
          source: "github:example/repo",
          origin: "https://github.com/example/repo",
          folderHash: "abc123",
          installedAt: "2025-01-15T10:30:00Z",
          updatedAt: "2025-01-15T10:30:00Z",
        },
      };

      expect(() => Schema.decodeUnknownSync(ExtensionLockMapSchema)(input)).toThrow();
    });
  });
});
