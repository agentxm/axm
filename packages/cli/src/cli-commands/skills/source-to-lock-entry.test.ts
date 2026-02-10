import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import type { SkillLockEntry } from "../../lockfile/schema.js";
import type {
  AzureReposSourceInput,
  BitbucketSourceInput,
  GitHubSourceInput,
  GitLabSourceInput,
  GitRepositorySourceInput,
  LocalSourceInput,
  RegistrySourceInput,
} from "../../sources/types.js";
import { sourceToLockEntry } from "./source-to-lock-entry.js";

const agents = ["claude", "cursor"];
const now = new Date("2025-01-15T00:00:00.000Z");

describe("sourceToLockEntry", () => {
  // ---------------------------------------------------------------------------
  // GitHub
  // ---------------------------------------------------------------------------

  it("maps GitHub source with all optional fields", () => {
    const source: GitHubSourceInput = {
      source: "github",
      owner: "acme",
      repo: "skills",
      ref: Option.some("v1.0"),
      subPath: Option.some("prompts/code-review"),
    };

    const result = sourceToLockEntry({
      source,
      agents,
      gitTreeSha: Option.some("abc123"),
      now,
    });

    expect(result).toEqual({
      source: "github",
      owner: "acme",
      repo: "skills",
      ref: "v1.0",
      path: "prompts/code-review",
      agents,
      installedAt: now,
      updatedAt: now,
      gitTreeHash: "abc123",
    } satisfies SkillLockEntry);
  });

  it("maps GitHub source with none optional fields", () => {
    const source: GitHubSourceInput = {
      source: "github",
      owner: "acme",
      repo: "skills",
      ref: Option.none(),
      subPath: Option.none(),
    };

    const result = sourceToLockEntry({
      source,
      agents,
      gitTreeSha: Option.none(),
      now,
    });

    expect(result).toEqual({
      source: "github",
      owner: "acme",
      repo: "skills",
      agents,
      installedAt: now,
      updatedAt: now,
    } satisfies SkillLockEntry);
  });

  // ---------------------------------------------------------------------------
  // GitLab
  // ---------------------------------------------------------------------------

  it("maps GitLab source", () => {
    const source: GitLabSourceInput = {
      source: "gitlab",
      owner: "team",
      repo: "prompts",
      ref: Option.some("main"),
      subPath: Option.none(),
    };

    const result = sourceToLockEntry({
      source,
      agents,
      gitTreeSha: Option.none(),
      now,
    });

    expect(result).toEqual({
      source: "gitlab",
      owner: "team",
      repo: "prompts",
      ref: "main",
      agents,
      installedAt: now,
      updatedAt: now,
    } satisfies SkillLockEntry);
  });

  // ---------------------------------------------------------------------------
  // Bitbucket
  // ---------------------------------------------------------------------------

  it("maps Bitbucket source", () => {
    const source: BitbucketSourceInput = {
      source: "bitbucket",
      owner: "workspace",
      repo: "skills-repo",
      ref: Option.none(),
      subPath: Option.some("skills/lint"),
    };

    const result = sourceToLockEntry({
      source,
      agents,
      gitTreeSha: Option.none(),
      now,
    });

    expect(result).toEqual({
      source: "bitbucket",
      owner: "workspace",
      repo: "skills-repo",
      path: "skills/lint",
      agents,
      installedAt: now,
      updatedAt: now,
    } satisfies SkillLockEntry);
  });

  // ---------------------------------------------------------------------------
  // Azure Repos
  // ---------------------------------------------------------------------------

  it("maps Azure Repos source", () => {
    const source: AzureReposSourceInput = {
      source: "azurerepos",
      organization: "myorg",
      project: "myproject",
      repo: "skills",
      ref: Option.some("develop"),
      subPath: Option.some("src/skill"),
    };

    const result = sourceToLockEntry({
      source,
      agents,
      gitTreeSha: Option.some("def456"),
      now,
    });

    expect(result).toEqual({
      source: "azurerepos",
      organization: "myorg",
      project: "myproject",
      repo: "skills",
      ref: "develop",
      path: "src/skill",
      agents,
      installedAt: now,
      updatedAt: now,
      gitTreeHash: "def456",
    } satisfies SkillLockEntry);
  });

  // ---------------------------------------------------------------------------
  // Git (URL variant)
  // ---------------------------------------------------------------------------

  it("maps Git URL source", () => {
    const source: GitRepositorySourceInput = {
      source: "git",
      url: "git@example.com:repo.git",
      ref: Option.some("main"),
    };

    const result = sourceToLockEntry({
      source,
      agents,
      gitTreeSha: Option.none(),
      now,
    });

    expect(result).toEqual({
      source: "git",
      url: "git@example.com:repo.git",
      ref: "main",
      agents,
      installedAt: now,
      updatedAt: now,
    } satisfies SkillLockEntry);
  });

  // ---------------------------------------------------------------------------
  // Git (path variant)
  // ---------------------------------------------------------------------------

  it("maps Git path source", () => {
    const source: GitRepositorySourceInput = {
      source: "git",
      path: "/home/user/repo",
      ref: Option.none(),
    };

    const result = sourceToLockEntry({
      source,
      agents,
      gitTreeSha: Option.none(),
      now,
    });

    expect(result).toEqual({
      source: "git",
      url: "/home/user/repo",
      agents,
      installedAt: now,
      updatedAt: now,
    } satisfies SkillLockEntry);
  });

  // ---------------------------------------------------------------------------
  // Local
  // ---------------------------------------------------------------------------

  it("maps Local source", () => {
    const source: LocalSourceInput = {
      source: "local",
      path: "/home/user/skills/my-skill",
    };

    const result = sourceToLockEntry({
      source,
      agents,
      gitTreeSha: Option.none(),
      now,
    });

    expect(result).toEqual({
      source: "local",
      path: "/home/user/skills/my-skill",
      agents,
      installedAt: now,
      updatedAt: now,
    } satisfies SkillLockEntry);
  });

  // ---------------------------------------------------------------------------
  // Registry
  // ---------------------------------------------------------------------------

  it("maps Registry source", () => {
    const source: RegistrySourceInput = {
      source: "registry",
    };

    const result = sourceToLockEntry({
      source,
      agents,
      gitTreeSha: Option.none(),
      now,
      registry: {
        scope: "@acme",
        name: "code-review",
        resolvedVersion: "2.1.0",
        checksum: "sha256:abcdef1234567890",
        sourceName: "local",
      },
    });

    expect(result).toEqual({
      source: "registry",
      scope: "@acme",
      name: "code-review",
      resolvedVersion: "2.1.0",
      checksum: "sha256:abcdef1234567890",
      sourceName: "local",
      agents,
      installedAt: now,
      updatedAt: now,
    } satisfies SkillLockEntry);
  });

  // ---------------------------------------------------------------------------
  // Option→undefined conversion
  // ---------------------------------------------------------------------------

  it("converts Option.some to plain value", () => {
    const source: GitHubSourceInput = {
      source: "github",
      owner: "a",
      repo: "b",
      ref: Option.some("v1"),
      subPath: Option.some("dir"),
    };

    const result = sourceToLockEntry({
      source,
      agents: [],
      gitTreeSha: Option.some("sha"),
      now,
    });

    expect(result.source).toBe("github");
    if (result.source !== "github") throw new Error("Expected github");
    expect(result.ref).toBe("v1");
    expect(result.path).toBe("dir");
    expect(result.gitTreeHash).toBe("sha");
  });

  it("converts Option.none to undefined (omitted)", () => {
    const source: GitHubSourceInput = {
      source: "github",
      owner: "a",
      repo: "b",
      ref: Option.none(),
      subPath: Option.none(),
    };

    const result = sourceToLockEntry({
      source,
      agents: [],
      gitTreeSha: Option.none(),
      now,
    });

    expect(result).not.toHaveProperty("ref");
    expect(result).not.toHaveProperty("path");
    expect(result).not.toHaveProperty("gitTreeHash");
  });
});
