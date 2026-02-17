import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import type { SkillLockEntry } from "../../lockfile/schema.js";
import type {
  BuiltinSkillRef,
  GitHubSkillRef,
  GitLabSkillRef,
  BitbucketSkillRef,
  AzureReposSkillRef,
  GitSkillRef,
  LocalSkillRef,
  RegistrySkillRef,
} from "../../sources/types.js";
import { sourceToLockEntry } from "./source-to-lock-entry.js";

const agents = ["claude", "cursor"];
const now = new Date("2025-01-15T00:00:00.000Z");

const skillBase = {
  type: "skill" as const,
  skill: { name: "test-skill", description: "A test skill", metadata: Option.none() },
};

describe("sourceToLockEntry", () => {
  // ---------------------------------------------------------------------------
  // GitHub
  // ---------------------------------------------------------------------------

  it("maps GitHub ref with all optional fields", () => {
    const ref: GitHubSkillRef = {
      ...skillBase,
      source: {
        type: "github",
        url: new URL("https://github.com"),
        owner: "acme",
        repo: "skills",
        ref: Option.some("v1.0"),
        subPath: Option.some("prompts/code-review"),
      },
      location: "file:///tmp/clone",
      gitTreeSha: Option.some("abc123"),
    };

    const result = sourceToLockEntry({ ref, agents, now });

    expect(result).toEqual({
      type: "github",
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

  it("maps GitHub ref with none optional fields", () => {
    const ref: GitHubSkillRef = {
      ...skillBase,
      source: {
        type: "github",
        url: new URL("https://github.com"),
        owner: "acme",
        repo: "skills",
        ref: Option.none(),
        subPath: Option.none(),
      },
      location: "file:///tmp/clone",
      gitTreeSha: Option.none(),
    };

    const result = sourceToLockEntry({ ref, agents, now });

    expect(result).toEqual({
      type: "github",
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

  it("maps GitLab ref", () => {
    const ref: GitLabSkillRef = {
      ...skillBase,
      source: {
        type: "gitlab",
        url: new URL("https://gitlab.com"),
        owner: "team",
        repo: "prompts",
        ref: Option.some("main"),
        subPath: Option.none(),
      },
      location: "file:///tmp/clone",
      gitTreeSha: Option.none(),
    };

    const result = sourceToLockEntry({ ref, agents, now });

    expect(result).toEqual({
      type: "gitlab",
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

  it("maps Bitbucket ref", () => {
    const ref: BitbucketSkillRef = {
      ...skillBase,
      source: {
        type: "bitbucket",
        url: new URL("https://bitbucket.org"),
        owner: "workspace",
        repo: "skills-repo",
        ref: Option.none(),
        subPath: Option.some("skills/lint"),
      },
      location: "file:///tmp/clone",
      gitTreeSha: Option.none(),
    };

    const result = sourceToLockEntry({ ref, agents, now });

    expect(result).toEqual({
      type: "bitbucket",
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

  it("maps Azure Repos ref", () => {
    const ref: AzureReposSkillRef = {
      ...skillBase,
      source: {
        type: "azurerepos",
        url: new URL("https://dev.azure.com"),
        organization: "myorg",
        project: "myproject",
        repo: "skills",
        ref: Option.some("develop"),
        subPath: Option.some("src/skill"),
      },
      location: "file:///tmp/clone",
      gitTreeSha: Option.some("def456"),
    };

    const result = sourceToLockEntry({ ref, agents, now });

    expect(result).toEqual({
      type: "azurerepos",
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

  it("maps Git URL ref", () => {
    const ref: GitSkillRef = {
      ...skillBase,
      source: {
        type: "git",
        url: new URL("https://example.com/repo.git"),
        ref: Option.some("main"),
      },
      location: "file:///tmp/clone",
      gitTreeSha: Option.none(),
    };

    const result = sourceToLockEntry({ ref, agents, now });

    expect(result).toEqual({
      type: "git",
      url: "https://example.com/repo.git",
      ref: "main",
      agents,
      installedAt: now,
      updatedAt: now,
    } satisfies SkillLockEntry);
  });

  // ---------------------------------------------------------------------------
  // Local
  // ---------------------------------------------------------------------------

  it("maps Local ref", () => {
    const ref: LocalSkillRef = {
      ...skillBase,
      source: { type: "local", path: "/home/user/skills/my-skill" },
      location: "file:///home/user/skills/my-skill",
    };

    const result = sourceToLockEntry({ ref, agents, now });

    expect(result).toEqual({
      type: "local",
      path: "/home/user/skills/my-skill",
      agents,
      installedAt: now,
      updatedAt: now,
    } satisfies SkillLockEntry);
  });

  // ---------------------------------------------------------------------------
  // Registry
  // ---------------------------------------------------------------------------

  it("maps Registry ref with version/checksum from ref details", () => {
    const ref: RegistrySkillRef = {
      ...skillBase,
      source: {
        type: "registry",
        scope: "@acme",
        name: "code-review",
        versionConstraint: Option.none(),
        url: new URL("http://localhost:3000"),
      },
      version: "2.1.0",
      checksum: "sha256:abcdef1234567890",
    };

    const result = sourceToLockEntry({
      ref,
      agents,
      now,
      sourceName: "local",
    });

    expect(result).toEqual({
      type: "registry",
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

  it("uses 'default' for sourceName when not provided", () => {
    const ref: RegistrySkillRef = {
      ...skillBase,
      source: {
        type: "registry",
        scope: "@community",
        name: "my-skill",
        versionConstraint: Option.none(),
        url: new URL("http://localhost:3000"),
      },
      version: "1.0.0",
      checksum: "sha256:abc",
    };

    const result = sourceToLockEntry({ ref, agents, now });

    expect(result.type).toBe("registry");
    if (result.type !== "registry") throw new Error("Expected registry");
    expect(result.sourceName).toBe("default");
  });

  // ---------------------------------------------------------------------------
  // Builtin
  // ---------------------------------------------------------------------------

  it("maps Builtin ref", () => {
    const ref: BuiltinSkillRef = {
      ...skillBase,
      source: { type: "builtin" },
    };

    const result = sourceToLockEntry({ ref, agents, now });

    expect(result).toEqual({
      type: "builtin",
      agents,
      installedAt: now,
      updatedAt: now,
    } satisfies SkillLockEntry);
  });

  // ---------------------------------------------------------------------------
  // Option→undefined conversion
  // ---------------------------------------------------------------------------

  it("converts Option.some to plain value", () => {
    const ref: GitHubSkillRef = {
      ...skillBase,
      source: {
        type: "github",
        url: new URL("https://github.com"),
        owner: "a",
        repo: "b",
        ref: Option.some("v1"),
        subPath: Option.some("dir"),
      },
      location: "file:///tmp/clone",
      gitTreeSha: Option.some("sha"),
    };

    const result = sourceToLockEntry({ ref, agents: [], now });

    expect(result.type).toBe("github");
    if (result.type !== "github") throw new Error("Expected github");
    expect(result.ref).toBe("v1");
    expect(result.path).toBe("dir");
    expect(result.gitTreeHash).toBe("sha");
  });

  it("converts Option.none to undefined (omitted)", () => {
    const ref: GitHubSkillRef = {
      ...skillBase,
      source: {
        type: "github",
        url: new URL("https://github.com"),
        owner: "a",
        repo: "b",
        ref: Option.none(),
        subPath: Option.none(),
      },
      location: "file:///tmp/clone",
      gitTreeSha: Option.none(),
    };

    const result = sourceToLockEntry({ ref, agents: [], now });

    expect(result).not.toHaveProperty("ref");
    expect(result).not.toHaveProperty("path");
    expect(result).not.toHaveProperty("gitTreeHash");
  });
});
