import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { DateFromIsoDateTimeStringSchema } from "../date-time.js";
import {
  LOCKFILE_VERSION,
  CommandLockEntrySchema,
  FilesLockEntrySchema,
  LibraryLockEntrySchema,
  LockfileSchema,
  PackLockEntrySchema,
  PacksLockMapSchema,
  SkillLockEntrySchema,
  SkillsLockMapSchema,
} from "./schema.js";
import { VersionSchema } from "../version-constraints/version-constraints.js";

describe("lockfile schema", () => {
  describe("DateFromIsoDateTimeStringSchema", () => {
    it("accepts valid ISO 8601 date string", () => {
      const result = Schema.decodeUnknownSync(DateFromIsoDateTimeStringSchema)(
        "2025-01-15T10:30:00Z",
      );
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe("2025-01-15T10:30:00.000Z");
    });

    it("rejects invalid date string", () => {
      expect(() => Schema.decodeUnknownSync(DateFromIsoDateTimeStringSchema)("garbage")).toThrow();
    });

    it("rejects empty string", () => {
      expect(() => Schema.decodeUnknownSync(DateFromIsoDateTimeStringSchema)("")).toThrow();
    });

    it("rejects string that produces Invalid Date", () => {
      expect(() =>
        Schema.decodeUnknownSync(DateFromIsoDateTimeStringSchema)("not-a-date"),
      ).toThrow();
    });

    it("round-trips valid date string", () => {
      const input = "2025-01-15T10:30:00.000Z";
      const decoded = Schema.decodeUnknownSync(DateFromIsoDateTimeStringSchema)(input);
      const encoded = Schema.encodeSync(DateFromIsoDateTimeStringSchema)(decoded);
      expect(encoded).toBe(input);
    });
  });

  describe("Version", () => {
    it("accepts exact semver versions", () => {
      expect(Schema.decodeUnknownSync(VersionSchema)("1.2.3")).toBe("1.2.3");
      expect(Schema.decodeUnknownSync(VersionSchema)("1.2.3-beta.1")).toBe("1.2.3-beta.1");
    });

    it("rejects semver ranges", () => {
      expect(() => Schema.decodeUnknownSync(VersionSchema)("^1.2.3")).toThrow();
      expect(() => Schema.decodeUnknownSync(VersionSchema)("~1.2.3")).toThrow();
      expect(() => Schema.decodeUnknownSync(VersionSchema)(">=1.0.0 <2.0.0")).toThrow();
      expect(() => Schema.decodeUnknownSync(VersionSchema)("*")).toThrow();
    });
  });

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

    it("rejects command registry lock entry with range resolvedVersion", () => {
      const input = {
        lockfileVersion: 1,
        skills: {},
        commands: {
          formatter: {
            type: "registry",
            owner: "@acme",
            name: "formatter",
            resolvedVersion: "^1.0.0",
            integrity: "sha512-abc123",
            sourceName: "default",
            agents: ["claude-code"],
            installedAt: "2025-01-15T10:30:00Z",
            updatedAt: "2025-01-15T10:30:00Z",
          },
        },
      };

      expect(() => Schema.decodeUnknownSync(LockfileSchema)(input)).toThrow();
    });

    it("rejects mcp server registry lock entry with range resolvedVersion", () => {
      const input = {
        lockfileVersion: 1,
        skills: {},
        mcpServers: {
          "local-tools": {
            type: "registry",
            owner: "@acme",
            name: "local-tools",
            resolvedVersion: "~2.0.0",
            integrity: "sha512-abc123",
            sourceName: "default",
            installedAt: "2025-01-15T10:30:00Z",
            updatedAt: "2025-01-15T10:30:00Z",
          },
        },
      };

      expect(() => Schema.decodeUnknownSync(LockfileSchema)(input)).toThrow();
    });

    it("accepts context lock entries with resolved inputs and materialized targets", () => {
      const input = {
        lockfileVersion: LOCKFILE_VERSION,
        skills: {},
        files: {
          baseline: {
            type: "registry",
            owner: "@acme",
            name: "baseline",
            resolvedVersion: "1.0.0",
            integrity: "sha512-abc123",
            sourceName: "default",
            installedAt: "2025-01-15T10:30:00Z",
            updatedAt: "2025-01-15T10:30:00Z",
            resolvedInputs: {
              projectName: "AgentXM",
              strict: true,
              maxDepth: 3,
            },
            materializedTargets: [
              {
                target: "README.md",
                mode: "managed-region",
                region: "workspace-index",
                renderHash: "abc123",
              },
              {
                target: ".editorconfig",
                mode: "sync-always",
                renderHash: "def456",
              },
            ],
          },
        },
      };

      const result = Schema.decodeUnknownSync(LockfileSchema)(input);

      expect(result.files?.["baseline"]?.type).toBe("registry");
      expect(result.files?.["baseline"]?.materializedTargets).toHaveLength(2);
      expect(result.files?.["baseline"]?.resolvedInputs).toEqual({
        projectName: "AgentXM",
        strict: true,
        maxDepth: 3,
      });
    });

    it("accepts library lock entries with membership digest and resolved members", () => {
      const input = {
        lockfileVersion: LOCKFILE_VERSION,
        skills: {},
        libraries: {
          frontend: {
            type: "registry",
            owner: "@acme",
            name: "frontend",
            sourceName: "default",
            membershipDigest: "sha256-members",
            resolvedAt: "2025-01-15T10:30:00Z",
            installedAt: "2025-01-15T10:30:00Z",
            updatedAt: "2025-01-15T10:30:00Z",
            resolvedSkills: {
              "@acme/skills/reviewer": "1.2.3",
            },
            resolvedCommands: {},
            resolvedMcpServers: {},
            resolvedSubagents: {},
            resolvedFiles: {},
            resolvedRules: {},
            resolvedHooks: {},
          },
        },
      };

      const result = Schema.decodeUnknownSync(LockfileSchema)(input);

      expect(result.libraries?.["frontend"]?.membershipDigest).toBe("sha256-members");
      expect(result.libraries?.["frontend"]?.resolvedSkills).toEqual({
        "@acme/skills/reviewer": "1.2.3",
      });
    });

    it("rejects library lock entries with ranged resolved member versions", () => {
      const input = {
        type: "registry",
        owner: "@acme",
        name: "frontend",
        sourceName: "default",
        membershipDigest: "sha256-members",
        resolvedAt: "2025-01-15T10:30:00Z",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
        resolvedSkills: {
          "@acme/skills/reviewer": "^1.2.3",
        },
        resolvedCommands: {},
        resolvedMcpServers: {},
        resolvedSubagents: {},
        resolvedFiles: {},
        resolvedRules: {},
        resolvedHooks: {},
      };

      expect(() => Schema.decodeUnknownSync(LibraryLockEntrySchema)(input)).toThrow();
    });

    it("rejects context lock entries with absolute target paths", () => {
      const input = {
        type: "local",
        path: "./files/baseline",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
        materializedTargets: [
          {
            target: "/tmp/README.md",
            mode: "sync-always",
            renderHash: "abc123",
          },
        ],
      };

      expect(() => Schema.decodeUnknownSync(FilesLockEntrySchema)(input)).toThrow();
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
            owner: "@acme",
            name: "my-skill",
            resolvedVersion: "1.0.0",
            integrity: "sha512-abc123def456",
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
        expect(skill.owner).toBe("@acme");
        expect(skill.name).toBe("my-skill");
        expect(skill.resolvedVersion).toBe("1.0.0");
        expect(skill.integrity).toBe("sha512-abc123def456");
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

    it("accepts GitLab subgroup namespace lock entries", () => {
      const input = {
        type: "gitlab",
        owner: "example/subgroup",
        repo: "extensions",
        path: "subagents/researcher",
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      const result = Schema.decodeUnknownSync(SkillLockEntrySchema)(input);

      expect(result.type).toBe("gitlab");
      if (result.type === "gitlab") {
        expect(result.owner).toBe("example/subgroup");
        expect(result.repo).toBe("extensions");
      }
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

    it("rejects local lock entry with absolute path", () => {
      const input = {
        type: "local",
        path: "/tmp/my-skill",
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(SkillLockEntrySchema)(input)).toThrow();
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
        owner: "@acme",
        name: "my-skill",
        resolvedVersion: "1.0.0",
        integrity: "sha512-abc123def456",
        sourceName: "local",
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      const result = Schema.decodeUnknownSync(SkillLockEntrySchema)(input);

      expect(result.type).toBe("registry");
      if (result.type === "registry") {
        expect(result.owner).toBe("@acme");
        expect(result.name).toBe("my-skill");
        expect(result.resolvedVersion).toBe("1.0.0");
        expect(result.integrity).toBe("sha512-abc123def456");
        expect(result.sourceName).toBe("local");
      }
    });

    it("accepts a workspace skill lock entry with intrinsic identity and content hash", () => {
      const input = {
        type: "workspace",
        owner: "@acme",
        extensionType: "skill",
        name: "my-skill",
        version: "1.0.0",
        sourceHash: "abc123def456",
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      const result = Schema.decodeUnknownSync(SkillLockEntrySchema)(input);

      expect(result).toMatchObject({
        type: "workspace",
        owner: "@acme",
        extensionType: "skill",
        name: "my-skill",
        version: "1.0.0",
        sourceHash: "abc123def456",
      });
    });

    it("rejects a workspace skill lock entry with a mismatched extension type", () => {
      const input = {
        type: "workspace",
        owner: "@acme",
        extensionType: "command",
        name: "my-skill",
        version: "1.0.0",
        sourceHash: "abc123def456",
        agents: [],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(SkillLockEntrySchema)(input)).toThrow();
    });

    it("rejects registry lock entry with range resolvedVersion", () => {
      const input = {
        type: "registry",
        owner: "@acme",
        name: "my-skill",
        resolvedVersion: "^1.0.0",
        integrity: "sha512-abc123def456",
        sourceName: "local",
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(SkillLockEntrySchema)(input)).toThrow();
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

    it("rejects registry lock entry missing owner", () => {
      const input = {
        type: "registry",
        name: "my-skill",
        resolvedVersion: "1.0.0",
        integrity: "sha512-abc123def456",
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
        owner: "@acme",
        resolvedVersion: "1.0.0",
        integrity: "sha512-abc123def456",
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
        owner: "@acme",
        name: "my-skill",
        integrity: "sha512-abc123def456",
        sourceName: "local",
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(SkillLockEntrySchema)(input)).toThrow();
    });

    it("rejects registry lock entry missing integrity", () => {
      const input = {
        type: "registry",
        owner: "@acme",
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
        owner: "@acme",
        name: "my-skill",
        resolvedVersion: "1.0.0",
        integrity: "sha512-abc123def456",
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(SkillLockEntrySchema)(input)).toThrow();
    });

    it("accepts skill lock entry with sourceHash and renderedFiles", () => {
      const input = {
        type: "local",
        path: "./my-skill",
        agents: ["universal", "claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
        sourceHash: "abc123def456",
        renderedFiles: {
          "claude-code": [{ path: ".claude/skills/my-skill" }],
        },
      };
      const result = Schema.decodeUnknownSync(SkillLockEntrySchema)(input);
      expect(result.sourceHash).toBe("abc123def456");
      expect(result.renderedFiles).toBeDefined();
      expect(result.agents).toEqual(["universal", "claude-code"]);
    });

    it("accepts skill lock entry without optional sourceHash and renderedFiles", () => {
      const input = {
        type: "github",
        owner: "example",
        repo: "skills",
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };
      const result = Schema.decodeUnknownSync(SkillLockEntrySchema)(input);
      expect(result.sourceHash).toBeUndefined();
      expect(result.renderedFiles).toBeUndefined();
    });

    it("roundtrips skill lock entry with sourceHash and renderedFiles", () => {
      const decode = Schema.decodeUnknownSync(SkillLockEntrySchema);
      const encode = Schema.encodeUnknownSync(SkillLockEntrySchema);
      const input = {
        type: "local",
        path: "./my-skill",
        agents: ["universal", "claude-code"],
        installedAt: "2025-01-15T10:30:00.000Z",
        updatedAt: "2025-01-15T10:30:00.000Z",
        sourceHash: "abc123",
        renderedFiles: {
          "claude-code": [{ path: ".claude/skills/my-skill" }],
        },
      };
      const decoded = decode(input);
      const encoded = encode(decoded);
      expect(encoded).toEqual(input);
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

  describe("CommandLockEntry", () => {
    const decode = Schema.decodeUnknownSync(CommandLockEntrySchema);
    const encode = Schema.encodeUnknownSync(CommandLockEntrySchema);

    it("accepts valid local command lock entry with agents", () => {
      const input = {
        type: "local",
        path: "./commands/deploy",
        agents: ["claude-code", "cursor"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };
      const result = decode(input);
      expect(result.type).toBe("local");
      expect(result.agents).toEqual(["claude-code", "cursor"]);
    });

    it("accepts command lock entry with sourceHash and renderedFiles", () => {
      const input = {
        type: "local",
        path: "./commands/deploy",
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
        sourceHash: "abc123def456",
        renderedFiles: {
          "claude-code": [{ path: ".claude/commands/deploy.md" }],
        },
      };
      const result = decode(input);
      expect(result.sourceHash).toBe("abc123def456");
      expect(result.renderedFiles).toBeDefined();
    });

    it("accepts command lock entry without optional sourceHash and renderedFiles", () => {
      const input = {
        type: "github",
        owner: "acme",
        repo: "commands",
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };
      const result = decode(input);
      expect(result.sourceHash).toBeUndefined();
      expect(result.renderedFiles).toBeUndefined();
    });

    it("roundtrips command lock entry with all fields", () => {
      const input = {
        type: "local",
        path: "./commands/deploy",
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00.000Z",
        updatedAt: "2025-01-15T10:30:00.000Z",
        sourceHash: "abc123",
        renderedFiles: {
          "claude-code": [{ path: ".claude/commands/deploy.md" }],
        },
      };
      const decoded = decode(input);
      const encoded = encode(decoded);
      expect(encoded).toEqual(input);
    });

    it("rejects command lock entry missing agents", () => {
      const input = {
        type: "local",
        path: "./commands/deploy",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };
      expect(() => decode(input)).toThrow();
    });
  });

  describe("PackLockEntry", () => {
    it("accepts valid pack lock entry with all resolved maps", () => {
      const input = {
        type: "registry",
        owner: "@acme",
        name: "frontend-pack",
        resolvedVersion: "1.0.0",
        integrity: "sha512-abc123def456",
        sourceName: "default",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
        resolvedSkills: { "@acme/skills/code-review": "1.2.0" },
        resolvedCommands: { "@acme/commands/formatter": "1.0.0" },
        resolvedMcpServers: {},
        resolvedSubagents: {},
      };

      const result = Schema.decodeUnknownSync(PackLockEntrySchema)(input);

      expect(result.type).toBe("registry");
      expect(result.owner).toBe("@acme");
      expect(result.name).toBe("frontend-pack");
      if (result.type === "registry") {
        expect(result.resolvedVersion).toBe("1.0.0");
        expect(result.integrity).toBe("sha512-abc123def456");
        expect(result.sourceName).toBe("default");
      }
      expect(result.installedAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
      expect(result.resolvedSkills).toEqual({ "@acme/skills/code-review": "1.2.0" });
      expect(result.resolvedCommands).toEqual({ "@acme/commands/formatter": "1.0.0" });
      expect(result.resolvedMcpServers).toEqual({});
      expect(result.resolvedSubagents).toEqual({});
    });

    it("accepts pack lock entry with empty resolved maps", () => {
      const input = {
        type: "registry",
        owner: "@acme",
        name: "empty-pack",
        resolvedVersion: "0.1.0",
        integrity: "sha512-deadbeef",
        sourceName: "local",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
        resolvedSkills: {},
        resolvedCommands: {},
        resolvedMcpServers: {},
        resolvedSubagents: {},
      };

      const result = Schema.decodeUnknownSync(PackLockEntrySchema)(input);

      expect(result.resolvedSkills).toEqual({});
      expect(result.resolvedCommands).toEqual({});
      expect(result.resolvedMcpServers).toEqual({});
      expect(result.resolvedSubagents).toEqual({});
    });

    it("accepts a workspace pack lock entry", () => {
      const input = {
        type: "workspace",
        owner: "@acme",
        extensionType: "pack",
        name: "authored-pack",
        version: "1.0.0",
        sourceHash: "abc123def456",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
        resolvedSkills: {},
        resolvedCommands: {},
        resolvedMcpServers: {},
        resolvedSubagents: {},
      };

      const result = Schema.decodeUnknownSync(PackLockEntrySchema)(input);

      expect(result).toMatchObject({
        type: "workspace",
        owner: "@acme",
        extensionType: "pack",
        name: "authored-pack",
        version: "1.0.0",
        sourceHash: "abc123def456",
      });
    });

    it("accepts pack lock entry with resolvedSubagents", () => {
      const input = {
        type: "registry",
        owner: "@acme",
        name: "frontend-pack",
        resolvedVersion: "1.0.0",
        integrity: "sha512-abc123def456",
        sourceName: "default",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
        resolvedSkills: {},
        resolvedCommands: {},
        resolvedMcpServers: {},
        resolvedSubagents: { "@acme/subagents/reviewer": "2.0.0" },
      };

      const result = Schema.decodeUnknownSync(PackLockEntrySchema)(input);

      expect(result.resolvedSubagents).toEqual({ "@acme/subagents/reviewer": "2.0.0" });
    });

    it("rejects pack lock entry with range resolvedVersion", () => {
      const input = {
        type: "registry",
        owner: "@acme",
        name: "frontend-pack",
        resolvedVersion: "^1.0.0",
        integrity: "sha512-abc123",
        sourceName: "default",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
        resolvedSkills: {},
        resolvedCommands: {},
        resolvedMcpServers: {},
        resolvedSubagents: {},
      };

      expect(() => Schema.decodeUnknownSync(PackLockEntrySchema)(input)).toThrow();
    });

    it("rejects pack lock entry with range value in resolved maps", () => {
      const input = {
        type: "registry",
        owner: "@acme",
        name: "frontend-pack",
        resolvedVersion: "1.0.0",
        integrity: "sha512-abc123",
        sourceName: "default",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
        resolvedSkills: { "@acme/skills/code-review": "^1.2.0" },
        resolvedCommands: { "@acme/commands/formatter": "~1.0.0" },
        resolvedMcpServers: { "@acme/mcps/local-tools": ">=1.0.0 <2.0.0" },
        resolvedSubagents: {},
      };

      expect(() => Schema.decodeUnknownSync(PackLockEntrySchema)(input)).toThrow();
    });

    it("rejects pack lock entry missing owner", () => {
      const input = {
        type: "registry",
        name: "frontend-pack",
        resolvedVersion: "1.0.0",
        integrity: "sha512-abc123",
        sourceName: "default",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
        resolvedSkills: {},
        resolvedCommands: {},
        resolvedMcpServers: {},
        resolvedSubagents: {},
      };

      expect(() => Schema.decodeUnknownSync(PackLockEntrySchema)(input)).toThrow();
    });

    it("rejects pack lock entry missing resolvedSkills", () => {
      const input = {
        type: "registry",
        owner: "@acme",
        name: "frontend-pack",
        resolvedVersion: "1.0.0",
        integrity: "sha512-abc123",
        sourceName: "default",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
        resolvedCommands: {},
        resolvedMcpServers: {},
        resolvedSubagents: {},
      };

      expect(() => Schema.decodeUnknownSync(PackLockEntrySchema)(input)).toThrow();
    });

    it("rejects pack lock entry missing resolvedCommands", () => {
      const input = {
        type: "registry",
        owner: "@acme",
        name: "frontend-pack",
        resolvedVersion: "1.0.0",
        integrity: "sha512-abc123",
        sourceName: "default",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
        resolvedSkills: {},
        resolvedMcpServers: {},
        resolvedSubagents: {},
      };

      expect(() => Schema.decodeUnknownSync(PackLockEntrySchema)(input)).toThrow();
    });

    it("rejects pack lock entry missing resolvedMcpServers", () => {
      const input = {
        type: "registry",
        owner: "@acme",
        name: "frontend-pack",
        resolvedVersion: "1.0.0",
        integrity: "sha512-abc123",
        sourceName: "default",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
        resolvedSkills: {},
        resolvedCommands: {},
        resolvedSubagents: {},
      };

      expect(() => Schema.decodeUnknownSync(PackLockEntrySchema)(input)).toThrow();
    });

    it("rejects pack lock entry missing resolvedSubagents", () => {
      const input = {
        type: "registry",
        owner: "@acme",
        name: "frontend-pack",
        resolvedVersion: "1.0.0",
        integrity: "sha512-abc123",
        sourceName: "default",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
        resolvedSkills: {},
        resolvedCommands: {},
        resolvedMcpServers: {},
      };

      expect(() => Schema.decodeUnknownSync(PackLockEntrySchema)(input)).toThrow();
    });

    it("rejects pack lock entry with non-registry type", () => {
      const input = {
        type: "github",
        owner: "@acme",
        name: "frontend-pack",
        resolvedVersion: "1.0.0",
        integrity: "sha512-abc123",
        sourceName: "default",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
        resolvedSkills: {},
        resolvedCommands: {},
        resolvedMcpServers: {},
        resolvedSubagents: {},
      };

      expect(() => Schema.decodeUnknownSync(PackLockEntrySchema)(input)).toThrow();
    });
  });

  describe("PacksLockMap", () => {
    it("accepts empty packs map", () => {
      const result = Schema.decodeUnknownSync(PacksLockMapSchema)({});

      expect(result).toEqual({});
    });

    it("accepts map with valid pack entries", () => {
      const input = {
        "@acme/packs/frontend-pack": {
          type: "registry",
          owner: "@acme",
          name: "frontend-pack",
          resolvedVersion: "1.0.0",
          integrity: "sha512-abc123",
          sourceName: "default",
          installedAt: "2025-01-15T10:30:00Z",
          updatedAt: "2025-01-15T10:30:00Z",
          resolvedSkills: { "@acme/skills/code-review": "1.2.0" },
          resolvedCommands: {},
          resolvedMcpServers: {},
          resolvedSubagents: {},
        },
      };

      const result = Schema.decodeUnknownSync(PacksLockMapSchema)(input);

      expect(result["@acme/packs/frontend-pack"]).toBeDefined();
      expect(result["@acme/packs/frontend-pack"]?.resolvedSkills).toEqual({
        "@acme/skills/code-review": "1.2.0",
      });
    });
  });

  describe("Lockfile with packs", () => {
    it("accepts lockfile with packs section", () => {
      const input = {
        lockfileVersion: 1,
        skills: {},
        packs: {
          "@acme/packs/frontend-pack": {
            type: "registry",
            owner: "@acme",
            name: "frontend-pack",
            resolvedVersion: "1.0.0",
            integrity: "sha512-abc123",
            sourceName: "default",
            installedAt: "2025-01-15T10:30:00Z",
            updatedAt: "2025-01-15T10:30:00Z",
            resolvedSkills: { "@acme/skills/code-review": "1.2.0" },
            resolvedCommands: { "@acme/commands/formatter": "1.0.0" },
            resolvedMcpServers: {},
            resolvedSubagents: {},
          },
        },
      };

      const result = Schema.decodeUnknownSync(LockfileSchema)(input);

      expect(result.packs).toBeDefined();
      expect(result.packs?.["@acme/packs/frontend-pack"]).toBeDefined();
    });

    it("accepts lockfile without packs section", () => {
      const input = {
        lockfileVersion: 1,
        skills: {},
      };

      const result = Schema.decodeUnknownSync(LockfileSchema)(input);

      expect(result.packs).toBeUndefined();
    });
  });

  describe("Lockfile round-trip with registry entries", () => {
    it("decodes and re-encodes lockfile with registry packs and skills", () => {
      const input = {
        lockfileVersion: 1,
        skills: {
          "registry-skill": {
            type: "registry",
            owner: "@acme",
            name: "code-review",
            resolvedVersion: "1.2.0",
            integrity: "sha512-abc123",
            sourceName: "default",
            agents: ["claude-code"],
            installedAt: "2025-01-15T10:30:00.000Z",
            updatedAt: "2025-01-15T10:30:00.000Z",
          },
        },
        packs: {
          "@acme/packs/frontend-pack": {
            type: "registry",
            owner: "@acme",
            name: "frontend-pack",
            resolvedVersion: "1.0.0",
            integrity: "sha512-abc123",
            sourceName: "default",
            installedAt: "2025-01-15T10:30:00.000Z",
            updatedAt: "2025-01-15T10:30:00.000Z",
            resolvedSkills: { "@acme/skills/code-review": "1.2.0" },
            resolvedCommands: {},
            resolvedMcpServers: {},
            resolvedSubagents: {},
          },
        },
      };

      const decoded = Schema.decodeUnknownSync(LockfileSchema)(input);
      const encoded = Schema.encodeSync(LockfileSchema)(decoded);

      expect(encoded).toEqual(input);
    });
  });
});
