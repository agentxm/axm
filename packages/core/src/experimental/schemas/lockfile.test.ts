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
      expect(result.skills["my-skill"]?.source._tag).toBe("GitHub");
      if (result.skills["my-skill"]?.source._tag === "GitHub") {
        expect(result.skills["my-skill"]?.source.owner).toBe("wayne-industries");
        expect(result.skills["my-skill"]?.source.repo).toBe("skills");
      }
      expect(result.skills["my-skill"]?.gitTreeHash).toBe("abc123def456");
      expect(result.skills["my-skill"]?.agents).toEqual(["claude-code", "cursor"]);
    });

    it("accepts valid skill lock entry with Local source", () => {
      const input = {
        lockfileVersion: 1,
        skills: {
          "my-skill": {
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
            source: {
              _tag: "Registry",
              name: "@scope/my-skill",
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
      expect(result.skills["my-skill"]?.version).toBe("1.0.0");
    });

    it("accepts valid skill lock entry with WellKnown source", () => {
      const input = {
        lockfileVersion: 1,
        skills: {
          "my-skill": {
            source: {
              _tag: "WellKnown",
              baseUrl: "https://example.com",
              skillName: "my-skill",
            },
            gitTreeHash: "abc123",
            agents: ["claude-code"],
            installedAt: "2025-01-15T10:30:00Z",
            updatedAt: "2025-01-15T10:30:00Z",
          },
        },
      };

      const result = Schema.decodeUnknownSync(LockfileSchema)(input);

      expect(result.skills["my-skill"]).toBeDefined();
      expect(result.skills["my-skill"]?.source._tag).toBe("WellKnown");
    });

    it("accepts multiple skills", () => {
      const input = {
        lockfileVersion: 1,
        skills: {
          "skill-one": {
            source: { _tag: "Local", path: "./skills/one" },
            agents: ["claude-code"],
            installedAt: "2025-01-15T10:30:00Z",
            updatedAt: "2025-01-15T10:30:00Z",
          },
          "skill-two": {
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
  });

  describe("SkillLockEntry", () => {
    it("accepts valid lock entry with required fields only", () => {
      const input = {
        source: { _tag: "Local", path: "./my-skill" },
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      const result = Schema.decodeUnknownSync(SkillLockEntrySchema)(input);

      expect(result.source._tag).toBe("Local");
      expect(result.agents).toEqual(["claude-code"]);
      expect(result.installedAt).toBe("2025-01-15T10:30:00Z");
      expect(result.updatedAt).toBe("2025-01-15T10:30:00Z");
    });

    it("accepts valid lock entry with optional gitTreeHash", () => {
      const input = {
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
        source: {
          _tag: "Registry",
          name: "@scope/skill",
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

    it("rejects lock entry missing source", () => {
      const input = {
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(SkillLockEntrySchema)(input)).toThrow();
    });

    it("rejects lock entry missing agents", () => {
      const input = {
        source: { _tag: "Local", path: "./my-skill" },
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(SkillLockEntrySchema)(input)).toThrow();
    });

    it("rejects lock entry with empty agents array", () => {
      const input = {
        source: { _tag: "Local", path: "./my-skill" },
        agents: [],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(SkillLockEntrySchema)(input)).toThrow();
    });

    it("rejects lock entry missing installedAt", () => {
      const input = {
        source: { _tag: "Local", path: "./my-skill" },
        agents: ["claude-code"],
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(SkillLockEntrySchema)(input)).toThrow();
    });

    it("rejects lock entry missing updatedAt", () => {
      const input = {
        source: { _tag: "Local", path: "./my-skill" },
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(SkillLockEntrySchema)(input)).toThrow();
    });

    it("rejects lock entry with invalid source _tag", () => {
      const input = {
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
      const lockEntry = {
        source: { _tag: "Local", path: "./skills/my-skill" },
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      const input = {
        "my-skill": lockEntry,
        "another-skill": lockEntry,
      };

      const result = Schema.decodeUnknownSync(SkillsLockMapSchema)(input);

      expect(result["my-skill"]).toBeDefined();
      expect(result["another-skill"]).toBeDefined();
    });
  });
});
