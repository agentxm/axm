import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { LockfileSchema, SkillLockEntrySchema, SkillsLockMapSchema } from "./schema.js";

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
            type: "github",
            owner: "wayne-industries",
            repo: "skills",
            ref: "main",
            path: "skills/my-skill",
            gitTreeHash: "abc123def456",
            agents: ["claude-code", "cursor"],
            installedAt: "2025-01-15T10:30:00Z",
            updatedAt: "2025-01-15T10:30:00Z",
          },
        },
      };

      const result = Schema.decodeUnknownSync(LockfileSchema)(input);

      expect(result.lockfileVersion).toBe(1);
      const skill = result.skills["my-skill"];
      expect(skill).toBeDefined();
      expect(skill?.type).toBe("github");
      if (skill?.type === "github") {
        expect(skill.owner).toBe("wayne-industries");
        expect(skill.repo).toBe("skills");
      }
      expect(skill?.gitTreeHash).toBe("abc123def456");
      expect(skill?.agents).toEqual(["claude-code", "cursor"]);
      // Dates are decoded to Date objects
      expect(skill?.installedAt).toBeInstanceOf(Date);
      expect(skill?.updatedAt).toBeInstanceOf(Date);
    });

    it("accepts valid skill lock entry with Local source", () => {
      const input = {
        lockfileVersion: 1,
        skills: {
          "my-skill": {
            type: "local",
            path: "./my-skills",
            agents: ["claude-code"],
            installedAt: "2025-01-15T10:30:00Z",
            updatedAt: "2025-01-15T10:30:00Z",
          },
        },
      };

      const result = Schema.decodeUnknownSync(LockfileSchema)(input);

      const skill = result.skills["my-skill"];
      expect(skill).toBeDefined();
      expect(skill?.type).toBe("local");
      if (skill?.type === "local") {
        expect(skill.path).toBe("./my-skills");
      }
    });

    it("accepts valid skill lock entry with Git source", () => {
      const input = {
        lockfileVersion: 1,
        skills: {
          "my-skill": {
            type: "git",
            url: "https://gitlab.com/example/skills.git",
            ref: "v1.0.0",
            path: "skills/my-skill",
            gitTreeHash: "abc123def456",
            agents: ["claude-code"],
            installedAt: "2025-01-15T10:30:00Z",
            updatedAt: "2025-01-15T10:30:00Z",
          },
        },
      };

      const result = Schema.decodeUnknownSync(LockfileSchema)(input);

      const skill = result.skills["my-skill"];
      expect(skill).toBeDefined();
      expect(skill?.type).toBe("git");
      if (skill?.type === "git") {
        expect(skill.url).toBe("https://gitlab.com/example/skills.git");
        expect(skill.ref).toBe("v1.0.0");
        expect(skill.path).toBe("skills/my-skill");
      }
    });

    it("accepts Git source with only required url field", () => {
      const input = {
        lockfileVersion: 1,
        skills: {
          "my-skill": {
            type: "git",
            url: "https://bitbucket.org/example/skills.git",
            agents: ["claude-code"],
            installedAt: "2025-01-15T10:30:00Z",
            updatedAt: "2025-01-15T10:30:00Z",
          },
        },
      };

      const result = Schema.decodeUnknownSync(LockfileSchema)(input);

      const skill = result.skills["my-skill"];
      expect(skill).toBeDefined();
      expect(skill?.type).toBe("git");
      if (skill?.type === "git") {
        expect(skill.url).toBe("https://bitbucket.org/example/skills.git");
        expect(skill.ref).toBeUndefined();
        expect(skill.path).toBeUndefined();
      }
    });

    it("accepts valid skill lock entry with Registry source", () => {
      const input = {
        lockfileVersion: 1,
        skills: {
          "my-skill": {
            type: "registry",
            scope: "@acme",
            name: "my-skill",
            resolvedVersion: "1.0.0",
            checksum: "sha256:abc123def456",
            sourceName: "local",
            agents: ["claude-code"],
            installedAt: "2025-01-15T10:30:00Z",
            updatedAt: "2025-01-15T10:30:00Z",
          },
        },
      };

      const result = Schema.decodeUnknownSync(LockfileSchema)(input);

      const skill = result.skills["my-skill"];
      expect(skill).toBeDefined();
      expect(skill?.type).toBe("registry");
      if (skill?.type === "registry") {
        expect(skill.scope).toBe("@acme");
        expect(skill.name).toBe("my-skill");
        expect(skill.resolvedVersion).toBe("1.0.0");
        expect(skill.checksum).toBe("sha256:abc123def456");
        expect(skill.sourceName).toBe("local");
      }
    });

    it("accepts multiple skills", () => {
      const input = {
        lockfileVersion: 1,
        skills: {
          "skill-one": {
            type: "local",
            path: "./skills/one",
            agents: ["claude-code"],
            installedAt: "2025-01-15T10:30:00Z",
            updatedAt: "2025-01-15T10:30:00Z",
          },
          "skill-two": {
            type: "local",
            path: "./skills/two",
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
            type: "local",
            path: "./my-skill",
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
    it("accepts valid GitHub lock entry with required fields", () => {
      const input = {
        type: "github",
        owner: "example",
        repo: "skills",
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      const result = Schema.decodeUnknownSync(SkillLockEntrySchema)(input);

      expect(result.type).toBe("github");
      if (result.type === "github") {
        expect(result.owner).toBe("example");
        expect(result.repo).toBe("skills");
      }
      expect(result.agents).toEqual(["claude-code"]);
      expect(result.installedAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it("accepts valid GitHub lock entry with optional gitTreeHash", () => {
      const input = {
        type: "github",
        owner: "example",
        repo: "skills",
        ref: "main",
        path: "skills/my-skill",
        gitTreeHash: "abc123def456",
        agents: ["claude-code", "cursor"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      const result = Schema.decodeUnknownSync(SkillLockEntrySchema)(input);

      expect(result.gitTreeHash).toBe("abc123def456");
    });

    it("accepts valid local lock entry", () => {
      const input = {
        type: "local",
        path: "./my-skill",
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      const result = Schema.decodeUnknownSync(SkillLockEntrySchema)(input);

      expect(result.type).toBe("local");
      if (result.type === "local") {
        expect(result.path).toBe("./my-skill");
      }
    });

    it("accepts valid git lock entry", () => {
      const input = {
        type: "git",
        url: "https://gitlab.com/example/skills.git",
        ref: "main",
        path: "skills/my-skill",
        gitTreeHash: "abc123def456",
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      const result = Schema.decodeUnknownSync(SkillLockEntrySchema)(input);

      expect(result.type).toBe("git");
      if (result.type === "git") {
        expect(result.url).toBe("https://gitlab.com/example/skills.git");
        expect(result.ref).toBe("main");
        expect(result.path).toBe("skills/my-skill");
      }
      expect(result.gitTreeHash).toBe("abc123def456");
    });

    it("accepts valid registry lock entry", () => {
      const input = {
        type: "registry",
        scope: "@acme",
        name: "my-skill",
        resolvedVersion: "1.0.0",
        checksum: "sha256:abc123def456",
        sourceName: "local",
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      const result = Schema.decodeUnknownSync(SkillLockEntrySchema)(input);

      expect(result.type).toBe("registry");
      if (result.type === "registry") {
        expect(result.scope).toBe("@acme");
        expect(result.name).toBe("my-skill");
        expect(result.resolvedVersion).toBe("1.0.0");
        expect(result.checksum).toBe("sha256:abc123def456");
        expect(result.sourceName).toBe("local");
      }
    });

    it("accepts lock entry with empty agents array", () => {
      const input = {
        type: "local",
        path: "./my-skill",
        agents: [],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      const result = Schema.decodeUnknownSync(SkillLockEntrySchema)(input);

      expect(result.agents).toEqual([]);
    });

    it("rejects lock entry missing source", () => {
      const input = {
        path: "./my-skill",
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(SkillLockEntrySchema)(input)).toThrow();
    });

    it("rejects lock entry missing agents", () => {
      const input = {
        type: "local",
        path: "./my-skill",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(SkillLockEntrySchema)(input)).toThrow();
    });

    it("rejects lock entry missing installedAt", () => {
      const input = {
        type: "local",
        path: "./my-skill",
        agents: ["claude-code"],
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(SkillLockEntrySchema)(input)).toThrow();
    });

    it("rejects lock entry missing updatedAt", () => {
      const input = {
        type: "local",
        path: "./my-skill",
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(SkillLockEntrySchema)(input)).toThrow();
    });

    it("rejects lock entry with invalid source type", () => {
      const input = {
        type: "invalid",
        path: "./my-skill",
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(SkillLockEntrySchema)(input)).toThrow();
    });

    it("rejects GitHub lock entry missing owner", () => {
      const input = {
        type: "github",
        repo: "skills",
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(SkillLockEntrySchema)(input)).toThrow();
    });

    it("rejects GitHub lock entry missing repo", () => {
      const input = {
        type: "github",
        owner: "example",
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(SkillLockEntrySchema)(input)).toThrow();
    });

    it("rejects local lock entry missing path", () => {
      const input = {
        type: "local",
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(SkillLockEntrySchema)(input)).toThrow();
    });

    it("rejects git lock entry missing url", () => {
      const input = {
        type: "git",
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(SkillLockEntrySchema)(input)).toThrow();
    });

    it("rejects registry lock entry missing scope", () => {
      const input = {
        type: "registry",
        name: "my-skill",
        resolvedVersion: "1.0.0",
        checksum: "sha256:abc123def456",
        sourceName: "local",
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(SkillLockEntrySchema)(input)).toThrow();
    });

    it("rejects registry lock entry missing name", () => {
      const input = {
        type: "registry",
        scope: "@acme",
        resolvedVersion: "1.0.0",
        checksum: "sha256:abc123def456",
        sourceName: "local",
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(SkillLockEntrySchema)(input)).toThrow();
    });

    it("rejects registry lock entry missing resolvedVersion", () => {
      const input = {
        type: "registry",
        scope: "@acme",
        name: "my-skill",
        checksum: "sha256:abc123def456",
        sourceName: "local",
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(SkillLockEntrySchema)(input)).toThrow();
    });

    it("rejects registry lock entry missing checksum", () => {
      const input = {
        type: "registry",
        scope: "@acme",
        name: "my-skill",
        resolvedVersion: "1.0.0",
        sourceName: "local",
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(SkillLockEntrySchema)(input)).toThrow();
    });

    it("rejects registry lock entry missing sourceName", () => {
      const input = {
        type: "registry",
        scope: "@acme",
        name: "my-skill",
        resolvedVersion: "1.0.0",
        checksum: "sha256:abc123def456",
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
          type: "local",
          path: "./skills/my-skill",
          agents: ["claude-code"],
          installedAt: "2025-01-15T10:30:00Z",
          updatedAt: "2025-01-15T10:30:00Z",
        },
        "another-skill": {
          type: "local",
          path: "./skills/another-skill",
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
