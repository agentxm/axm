import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import { LockfileSchema, SkillLockEntrySchema, SkillsLockMapSchema } from "./lockfile";

describe("lockfile schema", () => {
  describe("Lockfile", () => {
    it("accepts valid minimal lockfile", () => {
      const input = {
        lockfileVersion: 1,
        skills: {},
      };

      const result = Schema.decodeUnknownSync(LockfileSchema)(input);

      expect(result.lockfileVersion).toBe(1);
      expect(result.skills).toEqual({});
    });

    it("rejects missing lockfileVersion", () => {
      const input = {
        skills: {},
      };

      expect(() => Schema.decodeUnknownSync(LockfileSchema)(input)).toThrow();
    });

    it("accepts valid skill lock entry with GitHub source", () => {
      const input = {
        lockfileVersion: 1,
        skills: {
          "my-skill": {
            name: "my-skill",
            source: {
              _tag: "GitHub",
              owner: "wayne-industries",
              repo: "skills",
              ref: "main",
              path: "skills/my-skill",
            },
            gitTreeHash: "abc123def456",
            agents: ["claude-code", "cursor"],
            installedAt: "2025-01-15T10:30:00Z",
            updatedAt: "2025-01-15T10:30:00Z",
          },
        },
      };

      const result = Schema.decodeUnknownSync(LockfileSchema)(input);

      expect(result.lockfileVersion).toBe(1);
      expect(result.skills["my-skill"]).toBeDefined();
      expect(result.skills["my-skill"]?.name).toBe("my-skill");
      expect(result.skills["my-skill"]?.source._tag).toBe("GitHub");
      if (result.skills["my-skill"]?.source._tag === "GitHub") {
        expect(result.skills["my-skill"]?.source.owner).toBe("wayne-industries");
        expect(result.skills["my-skill"]?.source.repo).toBe("skills");
      }
      expect(result.skills["my-skill"]?.gitTreeHash).toBe("abc123def456");
      expect(result.skills["my-skill"]?.agents).toEqual(["claude-code", "cursor"]);
      // Dates are decoded to Date objects
      expect(result.skills["my-skill"]?.installedAt).toBeInstanceOf(Date);
      expect(result.skills["my-skill"]?.updatedAt).toBeInstanceOf(Date);
    });

    it("accepts valid skill lock entry with Local source", () => {
      const input = {
        lockfileVersion: 1,
        skills: {
          "my-skill": {
            name: "my-skill",
            source: {
              _tag: "Local",
              path: "./my-skills",
            },
            agents: ["claude-code"],
            installedAt: "2025-01-15T10:30:00Z",
            updatedAt: "2025-01-15T10:30:00Z",
          },
        },
      };

      const result = Schema.decodeUnknownSync(LockfileSchema)(input);

      expect(result.skills["my-skill"]).toBeDefined();
      expect(result.skills["my-skill"]?.source._tag).toBe("Local");
      if (result.skills["my-skill"]?.source._tag === "Local") {
        expect(result.skills["my-skill"]?.source.path).toBe("./my-skills");
      }
    });

    it("accepts valid skill lock entry with Registry source and version", () => {
      const input = {
        lockfileVersion: 1,
        skills: {
          "my-skill": {
            name: "my-skill",
            source: {
              _tag: "Registry",
              location: { _tag: "Remote", url: "https://registry.example.com" },
              scope: "example",
              name: "my-skill",
              version: "1.0.0",
            },
            version: "1.0.0",
            agents: ["claude-code"],
            installedAt: "2025-01-15T10:30:00Z",
            updatedAt: "2025-01-15T10:30:00Z",
          },
        },
      };

      const result = Schema.decodeUnknownSync(LockfileSchema)(input);

      expect(result.skills["my-skill"]).toBeDefined();
      expect(result.skills["my-skill"]?.source._tag).toBe("Registry");
      if (result.skills["my-skill"]?.source._tag === "Registry") {
        expect(result.skills["my-skill"]?.source.location._tag).toBe("Remote");
        expect(result.skills["my-skill"]?.source.scope).toBe("example");
        expect(result.skills["my-skill"]?.source.name).toBe("my-skill");
      }
      expect(result.skills["my-skill"]?.version).toBe("1.0.0");
    });

    it("accepts Registry source with FileSystem location", () => {
      const input = {
        lockfileVersion: 1,
        skills: {
          "my-skill": {
            name: "my-skill",
            source: {
              _tag: "Registry",
              location: { _tag: "FileSystem", path: "/local/registry" },
              scope: "local",
              name: "my-skill",
            },
            agents: ["claude-code"],
            installedAt: "2025-01-15T10:30:00Z",
            updatedAt: "2025-01-15T10:30:00Z",
          },
        },
      };

      const result = Schema.decodeUnknownSync(LockfileSchema)(input);

      expect(result.skills["my-skill"]).toBeDefined();
      if (result.skills["my-skill"]?.source._tag === "Registry") {
        expect(result.skills["my-skill"]?.source.location._tag).toBe("FileSystem");
        if (result.skills["my-skill"]?.source.location._tag === "FileSystem") {
          expect(result.skills["my-skill"]?.source.location.path).toBe("/local/registry");
        }
      }
    });

    it("accepts multiple skills", () => {
      const input = {
        lockfileVersion: 1,
        skills: {
          "skill-one": {
            name: "skill-one",
            source: { _tag: "Local", path: "./skills/one" },
            agents: ["claude-code"],
            installedAt: "2025-01-15T10:30:00Z",
            updatedAt: "2025-01-15T10:30:00Z",
          },
          "skill-two": {
            name: "skill-two",
            source: { _tag: "Local", path: "./skills/two" },
            agents: ["cursor"],
            installedAt: "2025-01-15T11:00:00Z",
            updatedAt: "2025-01-15T11:00:00Z",
          },
        },
      };

      const result = Schema.decodeUnknownSync(LockfileSchema)(input);

      expect(Object.keys(result.skills)).toHaveLength(2);
      expect(result.skills["skill-one"]).toBeDefined();
      expect(result.skills["skill-two"]).toBeDefined();
    });

    it("accepts skill with empty agents array", () => {
      const input = {
        lockfileVersion: 1,
        skills: {
          "my-skill": {
            name: "my-skill",
            source: { _tag: "Local", path: "./my-skill" },
            agents: [],
            installedAt: "2025-01-15T10:30:00Z",
            updatedAt: "2025-01-15T10:30:00Z",
          },
        },
      };

      const result = Schema.decodeUnknownSync(LockfileSchema)(input);

      expect(result.skills["my-skill"]?.agents).toEqual([]);
    });
  });

  describe("SkillLockEntry", () => {
    it("accepts valid lock entry with required fields only", () => {
      const input = {
        name: "my-skill",
        source: { _tag: "Local", path: "./my-skill" },
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      const result = Schema.decodeUnknownSync(SkillLockEntrySchema)(input);

      expect(result.name).toBe("my-skill");
      expect(result.source._tag).toBe("Local");
      expect(result.agents).toEqual(["claude-code"]);
      // Dates are decoded to Date objects
      expect(result.installedAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it("accepts valid lock entry with optional gitTreeHash", () => {
      const input = {
        name: "my-skill",
        source: {
          _tag: "GitHub",
          owner: "example",
          repo: "skills",
          ref: "main",
          path: "skills/my-skill",
        },
        gitTreeHash: "abc123def456",
        agents: ["claude-code", "cursor"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      const result = Schema.decodeUnknownSync(SkillLockEntrySchema)(input);

      expect(result.gitTreeHash).toBe("abc123def456");
    });

    it("accepts valid lock entry with optional version", () => {
      const input = {
        name: "my-skill",
        source: {
          _tag: "Registry",
          location: { _tag: "Remote", url: "https://registry.example.com" },
          scope: "example",
          name: "my-skill",
          version: "1.0.0",
        },
        version: "1.0.0",
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      const result = Schema.decodeUnknownSync(SkillLockEntrySchema)(input);

      expect(result.version).toBe("1.0.0");
    });

    it("accepts lock entry with empty agents array", () => {
      const input = {
        name: "my-skill",
        source: { _tag: "Local", path: "./my-skill" },
        agents: [],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      const result = Schema.decodeUnknownSync(SkillLockEntrySchema)(input);

      expect(result.agents).toEqual([]);
    });

    it("rejects lock entry missing name", () => {
      const input = {
        source: { _tag: "Local", path: "./my-skill" },
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(SkillLockEntrySchema)(input)).toThrow();
    });

    it("rejects lock entry missing source", () => {
      const input = {
        name: "my-skill",
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(SkillLockEntrySchema)(input)).toThrow();
    });

    it("rejects lock entry missing agents", () => {
      const input = {
        name: "my-skill",
        source: { _tag: "Local", path: "./my-skill" },
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(SkillLockEntrySchema)(input)).toThrow();
    });

    it("rejects lock entry missing installedAt", () => {
      const input = {
        name: "my-skill",
        source: { _tag: "Local", path: "./my-skill" },
        agents: ["claude-code"],
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(SkillLockEntrySchema)(input)).toThrow();
    });

    it("rejects lock entry missing updatedAt", () => {
      const input = {
        name: "my-skill",
        source: { _tag: "Local", path: "./my-skill" },
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(SkillLockEntrySchema)(input)).toThrow();
    });

    it("rejects lock entry with invalid source _tag", () => {
      const input = {
        name: "my-skill",
        source: { _tag: "InvalidType", path: "./my-skill" },
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(SkillLockEntrySchema)(input)).toThrow();
    });
  });

  describe("SkillsLockMap", () => {
    it("accepts empty skills map", () => {
      const input = {};

      const result = Schema.decodeUnknownSync(SkillsLockMapSchema)(input);

      expect(result).toEqual({});
    });

    it("accepts map with valid skill names", () => {
      const input = {
        "my-skill": {
          name: "my-skill",
          source: { _tag: "Local", path: "./skills/my-skill" },
          agents: ["claude-code"],
          installedAt: "2025-01-15T10:30:00Z",
          updatedAt: "2025-01-15T10:30:00Z",
        },
        "another-skill": {
          name: "another-skill",
          source: { _tag: "Local", path: "./skills/another-skill" },
          agents: ["claude-code"],
          installedAt: "2025-01-15T10:30:00Z",
          updatedAt: "2025-01-15T10:30:00Z",
        },
      };

      const result = Schema.decodeUnknownSync(SkillsLockMapSchema)(input);

      expect(result["my-skill"]).toBeDefined();
      expect(result["another-skill"]).toBeDefined();
    });
  });
});
