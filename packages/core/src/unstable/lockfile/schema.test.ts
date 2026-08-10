import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";
import { DateTimeUtcSchema } from "../date-time.js";
import {
  LOCKFILE_VERSION,
  HookLockEntrySchema,
  KnowledgeLockEntrySchema,
  LockfileSchema,
  McpServerLockEntrySchema,
  PackLockEntrySchema,
  PacksLockMapSchema,
  RuleLockEntrySchema,
  SkillLockEntrySchema,
  SkillsLockMapSchema,
} from "./schema.js";
import { VersionSchema } from "../version-constraints/version-constraints.js";

describe("lockfile schema", () => {
  describe("DateTimeUtcSchema", () => {
    it("accepts valid ISO 8601 date string", () => {
      const result = Schema.decodeUnknownSync(DateTimeUtcSchema)("2025-01-15T10:30:00Z");
      expect(DateTime.isDateTime(result)).toBe(true);
      expect(DateTime.formatIso(result)).toBe("2025-01-15T10:30:00.000Z");
    });

    it("rejects invalid date string", () => {
      expect(() => Schema.decodeUnknownSync(DateTimeUtcSchema)("garbage")).toThrow();
    });

    it("rejects empty string", () => {
      expect(() => Schema.decodeUnknownSync(DateTimeUtcSchema)("")).toThrow();
    });

    it("rejects string that produces Invalid Date", () => {
      expect(() => Schema.decodeUnknownSync(DateTimeUtcSchema)("not-a-date")).toThrow();
    });

    it("round-trips valid date string", () => {
      const input = "2025-01-15T10:30:00.000Z";
      const decoded = Schema.decodeUnknownSync(DateTimeUtcSchema)(input);
      const encoded = Schema.encodeSync(DateTimeUtcSchema)(decoded);
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
        lockfileVersion: 3,
        skills: {},
      };

      const result = Schema.decodeUnknownSync(LockfileSchema)(input);

      expect(result.lockfileVersion).toBe(3);
      expect(result.skills).toEqual({});
    });

    it("rejects missing lockfileVersion", () => {
      const input = {
        skills: {},
      };

      expect(() => Schema.decodeUnknownSync(LockfileSchema)(input)).toThrow();
    });

    it("rejects mcp server registry lock entry with range resolvedVersion", () => {
      const input = {
        lockfileVersion: 3,
        skills: {},
        mcpServers: {
          "local-tools": {
            type: "registry",
            owner: "@acme",
            name: "local-tools",
            resolvedVersion: "~2.0.0",
            integrity: "sha512-abc123",
            sourceName: "default",

            publisherBindingId: "hbnd_test",
            installedAt: "2025-01-15T10:30:00Z",
            updatedAt: "2025-01-15T10:30:00Z",
          },
        },
      };

      expect(() => Schema.decodeUnknownSync(LockfileSchema)(input)).toThrow();
    });

    it("tolerates and retains unknown top-level keys under onExcessProperty error", () => {
      // The removed legacy `libraries` state is rejected by explicit pre-decode
      // guards on the lockfile read paths, not by the schema; the schema now
      // carries unknown top-level keys so writes never discard them.
      const input = {
        lockfileVersion: LOCKFILE_VERSION,
        skills: {},
        futureFeature: { alpha: 1 },
      };

      const result = Schema.decodeUnknownSync(LockfileSchema)(input, {
        onExcessProperty: "error",
      });
      expect(result["futureFeature"]).toEqual({ alpha: 1 });
    });

    it("rejects removed file target state", () => {
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

      expect(() =>
        Schema.decodeUnknownSync(RuleLockEntrySchema)(input, { onExcessProperty: "error" }),
      ).toThrow();
    });

    it("accepts valid skill lock entry with GitHub source", () => {
      const input = {
        lockfileVersion: 3,
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

      expect(result.lockfileVersion).toBe(3);
      const skill = result.skills["my-skill"];
      expect(skill).toBeDefined();
      expect(skill?.type).toBe("github");
      if (skill?.type === "github") {
        expect(skill.owner).toBe("wayne-industries");
        expect(skill.repo).toBe("skills");
      }
      expect(skill?.gitTreeHash).toBe("abc123def456");
      expect(skill).not.toHaveProperty("agents");
      // Timestamps are decoded to DateTime.Utc values
      expect(DateTime.isDateTime(skill?.installedAt)).toBe(true);
      expect(DateTime.isDateTime(skill?.updatedAt)).toBe(true);
    });

    it("accepts valid skill lock entry with Local source", () => {
      const input = {
        lockfileVersion: 3,
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
        lockfileVersion: 3,
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
        lockfileVersion: 3,
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
        lockfileVersion: 3,
        skills: {
          "my-skill": {
            type: "registry",
            owner: "@acme",
            name: "my-skill",
            resolvedVersion: "1.0.0",
            integrity: "sha512-abc123def456",
            sourceName: "local",

            publisherBindingId: "hbnd_test",
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
        lockfileVersion: 3,
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

    it("rejects removed skill agent state", () => {
      const input = {
        lockfileVersion: 3,
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

      expect(() =>
        Schema.decodeUnknownSync(LockfileSchema)(input, { onExcessProperty: "error" }),
      ).toThrow();
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
      expect(result).not.toHaveProperty("agents");
      expect(DateTime.isDateTime(result.installedAt)).toBe(true);
      expect(DateTime.isDateTime(result.updatedAt)).toBe(true);
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

        publisherBindingId: "hbnd_test",
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

        publisherBindingId: "hbnd_test",
        agents: ["claude-code"],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(SkillLockEntrySchema)(input)).toThrow();
    });

    it("rejects removed agent state", () => {
      const input = {
        type: "local",
        path: "./my-skill",
        agents: [],
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() =>
        Schema.decodeUnknownSync(SkillLockEntrySchema)(input, { onExcessProperty: "error" }),
      ).toThrow();
    });

    it("rejects the removed retainedByPack receipt field", () => {
      const input = {
        type: "local",
        path: "./my-skill",
        retainedByPack: true,
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() =>
        Schema.decodeUnknownSync(SkillLockEntrySchema)(input, { onExcessProperty: "error" }),
      ).toThrow();
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

    it("accepts a lock entry without agents", () => {
      const input = {
        type: "local",
        path: "./my-skill",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
      };

      expect(() => Schema.decodeUnknownSync(SkillLockEntrySchema)(input)).not.toThrow();
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

        publisherBindingId: "hbnd_test",
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

        publisherBindingId: "hbnd_test",
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

        publisherBindingId: "hbnd_test",
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

        publisherBindingId: "hbnd_test",
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

    it("rejects removed skill materialization state", () => {
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
      expect(() =>
        Schema.decodeUnknownSync(SkillLockEntrySchema)(input, { onExcessProperty: "error" }),
      ).toThrow();
    });

    it("rejects removed capability render state", () => {
      const input = {
        type: "local",
        path: "skills/review",
        agents: ["codex"],
        installedAt: "2026-07-15T00:00:00.000Z",
        updatedAt: "2026-07-15T00:00:00.000Z",
        renderInputs: {
          codex: {
            sourceHash: "abc123",
            agent: "codex",
            catalogVersion: "2026-07-15.1",
            dslVersion: "1",
            capabilityHash: "def456",
            referencedCapabilities: ["subagents"],
          },
        },
        degradedRenders: {
          codex: ["missing-default-variant"],
        },
      };

      expect(() =>
        Schema.decodeUnknownSync(SkillLockEntrySchema)(input, { onExcessProperty: "error" }),
      ).toThrow();
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
      expect(result).not.toHaveProperty("renderedFiles");
    });

    it("roundtrips only shared skill fields", () => {
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
      expect(encoded).toEqual({
        type: "local",
        path: "./my-skill",
        installedAt: "2025-01-15T10:30:00.000Z",
        updatedAt: "2025-01-15T10:30:00.000Z",
        sourceHash: "abc123",
      });
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

  describe("optional sourceHash on non-skill lock entries", () => {
    const schemasByType = {
      "mcp-server": McpServerLockEntrySchema,
      rule: RuleLockEntrySchema,
      hook: HookLockEntrySchema,
      knowledge: KnowledgeLockEntrySchema,
    };

    const registryEntry = {
      type: "registry",
      owner: "@acme",
      name: "widget",
      resolvedVersion: "1.2.0",
      integrity: "sha512-abc123",
      sourceName: "default",
      publisherBindingId: "hbnd_test",
      installedAt: "2025-01-15T10:30:00.000Z",
      updatedAt: "2025-01-15T10:30:00.000Z",
    };

    for (const [type, schema] of Object.entries(schemasByType)) {
      const decode = Schema.decodeUnknownSync(schema);
      const encode = Schema.encodeUnknownSync(schema);

      it(`decodes a ${type} registry entry without sourceHash`, () => {
        const decoded = decode(registryEntry, { onExcessProperty: "error" });
        expect(decoded).not.toHaveProperty("sourceHash");
      });

      it(`round-trips a ${type} registry entry carrying sourceHash`, () => {
        const input = { ...registryEntry, sourceHash: "abc123" };
        expect(encode(decode(input, { onExcessProperty: "error" }))).toEqual(input);
      });

      it(`round-trips a ${type} git entry carrying sourceHash`, () => {
        const input = {
          type: "github",
          owner: "acme",
          repo: "widgets",
          sourceHash: "abc123",
          installedAt: "2025-01-15T10:30:00.000Z",
          updatedAt: "2025-01-15T10:30:00.000Z",
        };
        expect(encode(decode(input, { onExcessProperty: "error" }))).toEqual(input);
      });
    }

    it("rejects sourceHash on an inline MCP server entry", () => {
      const input = {
        type: "inline",
        command: "run-server",
        sourceHash: "abc123",
        installedAt: "2025-01-15T10:30:00.000Z",
        updatedAt: "2025-01-15T10:30:00.000Z",
      };
      expect(() =>
        Schema.decodeUnknownSync(McpServerLockEntrySchema)(input, { onExcessProperty: "error" }),
      ).toThrow();
    });
  });

  describe("PackLockEntry", () => {
    it("rejects source-less resolved Registry members", () => {
      const input = {
        type: "registry",
        owner: "@acme",
        name: "frontend-pack",
        resolvedVersion: "1.0.0",
        integrity: "sha512-pack",
        sourceName: "default",
        publisherBindingId: "hbnd_test",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
        resolvedSkills: {
          "@acme/skills/code-review": {
            version: "1.2.0",
            publisherBindingId: "hbnd_test",
          },
        },
        resolvedMcpServers: {},
        resolvedSubagents: {},
      };

      expect(() => Schema.decodeUnknownSync(PackLockEntrySchema)(input)).toThrow();
    });

    it("accepts valid pack lock entry with all resolved maps", () => {
      const input = {
        type: "registry",
        owner: "@acme",
        name: "frontend-pack",
        resolvedVersion: "1.0.0",
        integrity: "sha512-abc123def456",
        sourceName: "default",

        publisherBindingId: "hbnd_test",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
        resolvedSkills: {
          "@acme/skills/code-review": {
            source: "registry",
            version: "1.2.0",
            publisherBindingId: "hbnd_test",
            integrity: "sha512-member",
          },
        },
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
      expect(DateTime.isDateTime(result.installedAt)).toBe(true);
      expect(DateTime.isDateTime(result.updatedAt)).toBe(true);
      expect(result.resolvedSkills).toEqual({
        "@acme/skills/code-review": {
          source: "registry",
          version: "1.2.0",
          publisherBindingId: "hbnd_test",
          integrity: "sha512-member",
        },
      });
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

        publisherBindingId: "hbnd_test",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
        resolvedSkills: {},
        resolvedMcpServers: {},
        resolvedSubagents: {},
      };

      const result = Schema.decodeUnknownSync(PackLockEntrySchema)(input);

      expect(result.resolvedSkills).toEqual({});
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

        publisherBindingId: "hbnd_test",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
        resolvedSkills: {},
        resolvedMcpServers: {},
        resolvedSubagents: {
          "@acme/subagents/reviewer": {
            source: "registry",
            version: "2.0.0",
            publisherBindingId: "hbnd_test",
            integrity: "sha512-member",
          },
        },
      };

      const result = Schema.decodeUnknownSync(PackLockEntrySchema)(input);

      expect(result.resolvedSubagents).toEqual({
        "@acme/subagents/reviewer": {
          source: "registry",
          version: "2.0.0",
          publisherBindingId: "hbnd_test",
          integrity: "sha512-member",
        },
      });
    });

    it("rejects pack lock entry with range resolvedVersion", () => {
      const input = {
        type: "registry",
        owner: "@acme",
        name: "frontend-pack",
        resolvedVersion: "^1.0.0",
        integrity: "sha512-abc123",
        sourceName: "default",

        publisherBindingId: "hbnd_test",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
        resolvedSkills: {},
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

        publisherBindingId: "hbnd_test",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
        resolvedSkills: { "@acme/skills/code-review": "^1.2.0" },
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

        publisherBindingId: "hbnd_test",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
        resolvedSkills: {},
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

        publisherBindingId: "hbnd_test",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
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

        publisherBindingId: "hbnd_test",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
        resolvedSkills: {},
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

        publisherBindingId: "hbnd_test",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
        resolvedSkills: {},
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

        publisherBindingId: "hbnd_test",
        installedAt: "2025-01-15T10:30:00Z",
        updatedAt: "2025-01-15T10:30:00Z",
        resolvedSkills: {},
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

          publisherBindingId: "hbnd_test",
          installedAt: "2025-01-15T10:30:00Z",
          updatedAt: "2025-01-15T10:30:00Z",
          resolvedSkills: {
            "@acme/skills/code-review": {
              source: "registry",
              version: "1.2.0",
              publisherBindingId: "hbnd_test",
              integrity: "sha512-member",
            },
          },
          resolvedMcpServers: {},
          resolvedSubagents: {},
        },
      };

      const result = Schema.decodeUnknownSync(PacksLockMapSchema)(input);

      expect(result["@acme/packs/frontend-pack"]).toBeDefined();
      expect(result["@acme/packs/frontend-pack"]?.resolvedSkills).toEqual({
        "@acme/skills/code-review": {
          source: "registry",
          version: "1.2.0",
          publisherBindingId: "hbnd_test",
          integrity: "sha512-member",
        },
      });
    });
  });

  describe("Lockfile with packs", () => {
    it("accepts lockfile with packs section", () => {
      const input = {
        lockfileVersion: 3,
        skills: {},
        packs: {
          "@acme/packs/frontend-pack": {
            type: "registry",
            owner: "@acme",
            name: "frontend-pack",
            resolvedVersion: "1.0.0",
            integrity: "sha512-abc123",
            sourceName: "default",

            publisherBindingId: "hbnd_test",
            installedAt: "2025-01-15T10:30:00Z",
            updatedAt: "2025-01-15T10:30:00Z",
            resolvedSkills: {
              "@acme/skills/code-review": {
                source: "registry",
                version: "1.2.0",
                publisherBindingId: "hbnd_test",
                integrity: "sha512-member",
              },
            },
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
        lockfileVersion: 3,
        skills: {},
      };

      const result = Schema.decodeUnknownSync(LockfileSchema)(input);

      expect(result.packs).toBeUndefined();
    });
  });

  describe("Lockfile round-trip with registry entries", () => {
    it("rejects removed agent and render state from the shared lockfile shape", () => {
      const input = {
        lockfileVersion: 3,
        skills: {
          "registry-skill": {
            type: "registry",
            owner: "@acme",
            name: "code-review",
            resolvedVersion: "1.2.0",
            integrity: "sha512-abc123",
            sourceName: "default",

            publisherBindingId: "hbnd_test",
            renderedFiles: { "claude-code": [{ path: ".claude/skills/code-review" }] },
            renderInputs: {
              "claude-code": {
                sourceHash: "source",
                agent: "claude-code",
                catalogVersion: "1",
                dslVersion: "1",
                capabilityHash: "capability",
                referencedCapabilities: [],
              },
            },
            degradedRenders: { "claude-code": ["unsupported"] },
            installedAt: "2025-01-15T10:30:00.000Z",
            updatedAt: "2025-01-15T10:30:00.000Z",
          },
        },
      };

      expect(() =>
        Schema.decodeUnknownSync(LockfileSchema)(input, { onExcessProperty: "error" }),
      ).toThrow();
    });

    it("decodes and re-encodes lockfile with registry packs and skills", () => {
      const input = {
        lockfileVersion: 3,
        skills: {
          "registry-skill": {
            type: "registry",
            owner: "@acme",
            name: "code-review",
            resolvedVersion: "1.2.0",
            integrity: "sha512-abc123",
            sourceName: "default",

            publisherBindingId: "hbnd_test",
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

            publisherBindingId: "hbnd_test",
            installedAt: "2025-01-15T10:30:00.000Z",
            updatedAt: "2025-01-15T10:30:00.000Z",
            resolvedSkills: {
              "@acme/skills/code-review": {
                source: "registry",
                version: "1.2.0",
                publisherBindingId: "hbnd_test",
                integrity: "sha512-member",
              },
            },
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
