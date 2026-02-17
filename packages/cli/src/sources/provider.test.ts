/**
 * Tests for source provider types.
 *
 * Verifies field contracts and Option semantics for legacy ref variants.
 */

import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import type { McpServerRef, SkillRef } from "./provider.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeSkillRef = (overrides?: Partial<SkillRef>): SkillRef => ({
  type: "skill",
  skill: {
    name: "my-skill",
    description: "A test skill",
    metadata: Option.none(),
  },
  source: {
    type: "github",
    owner: "owner",
    repo: "repo",
    ref: Option.none(),
    subPath: Option.none(),
  },
  location: "file:///tmp/clone/skills/my-skill",
  version: Option.none(),
  gitTreeSha: Option.none(),
  ...overrides,
});

const makeMcpServerRef = (overrides?: Partial<McpServerRef>): McpServerRef => ({
  type: "mcp-server",
  name: "my-server",
  source: {
    type: "github",
    owner: "owner",
    repo: "repo",
    ref: Option.none(),
    subPath: Option.none(),
  },
  location: "file:///tmp/clone/servers/my-server",
  version: Option.none(),
  ...overrides,
});

// -----------------------------------------------------------------------------
// SkillRef
// -----------------------------------------------------------------------------

describe("SkillRef", () => {
  it("has type discriminator 'skill'", () => {
    const ref = makeSkillRef();
    expect(ref.type).toBe("skill");
  });

  it("carries skill metadata", () => {
    const ref = makeSkillRef();
    expect(ref.skill.name).toBe("my-skill");
    expect(ref.skill.description).toBe("A test skill");
    expect(Option.isNone(ref.skill.metadata)).toBe(true);
  });

  it("carries source input", () => {
    const ref = makeSkillRef();
    expect(ref.source.type).toBe("github");
    if (ref.source.type === "github") {
      expect(ref.source.owner).toBe("owner");
      expect(ref.source.repo).toBe("repo");
    }
  });

  it("has a location URL", () => {
    const ref = makeSkillRef();
    expect(ref.location).toBe("file:///tmp/clone/skills/my-skill");
  });

  it("has gitTreeSha field", () => {
    const ref = makeSkillRef({ gitTreeSha: Option.some("abc123def456") });
    expect(Option.isSome(ref.gitTreeSha)).toBe(true);
    expect(Option.getOrNull(ref.gitTreeSha)).toBe("abc123def456");
  });

  it("has None gitTreeSha when not available", () => {
    const ref = makeSkillRef();
    expect(Option.isNone(ref.gitTreeSha)).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// McpServerRef
// -----------------------------------------------------------------------------

describe("McpServerRef", () => {
  it("has type discriminator 'mcp-server'", () => {
    const ref = makeMcpServerRef();
    expect(ref.type).toBe("mcp-server");
  });

  it("carries server name", () => {
    const ref = makeMcpServerRef({ name: "code-review-server" });
    expect(ref.name).toBe("code-review-server");
  });

  it("carries source input", () => {
    const ref = makeMcpServerRef({
      source: { type: "local", path: "/home/user/servers/my-server" },
    });
    expect(ref.source.type).toBe("local");
    if (ref.source.type === "local") {
      expect(ref.source.path).toBe("/home/user/servers/my-server");
    }
  });

  it("has a location URL", () => {
    const ref = makeMcpServerRef();
    expect(ref.location).toBe("file:///tmp/clone/servers/my-server");
  });
});

// -----------------------------------------------------------------------------
// Legacy ref discriminated union
// -----------------------------------------------------------------------------

describe("legacy ref discriminated union", () => {
  it("narrows to SkillRef via type field", () => {
    const ref: SkillRef | McpServerRef = makeSkillRef();
    if (ref.type === "skill") {
      expect(ref.skill.name).toBe("my-skill");
    }
  });

  it("narrows to McpServerRef via type field", () => {
    const ref: SkillRef | McpServerRef = makeMcpServerRef();
    if (ref.type === "mcp-server") {
      expect(ref.name).toBe("my-server");
    }
  });
});

// -----------------------------------------------------------------------------
// Version Option semantics
// -----------------------------------------------------------------------------

describe("version Option semantics", () => {
  it("is None for git-sourced refs", () => {
    const ref = makeSkillRef({
      source: {
        type: "github",
        owner: "o",
        repo: "r",
        ref: Option.some("main"),
        subPath: Option.none(),
      },
      version: Option.none(),
    });
    expect(Option.isNone(ref.version)).toBe(true);
  });

  it("is None for local-sourced refs", () => {
    const ref = makeSkillRef({
      source: { type: "local", path: "/home/user/skills/my-skill" },
      location: "file:///home/user/skills/my-skill",
      version: Option.none(),
    });
    expect(Option.isNone(ref.version)).toBe(true);
  });

  it("is Some for registry-sourced refs", () => {
    const ref = makeSkillRef({
      source: {
        type: "registry",
        scope: "@acme",
        name: "code-review",
        versionConstraint: Option.none(),
      },
      location: "file:///registry/extensions/@acme/skills/code-review",
      version: Option.some("1.2.3"),
    });
    expect(Option.isSome(ref.version)).toBe(true);
    expect(Option.getOrNull(ref.version)).toBe("1.2.3");
  });

  it("is Some for registry-sourced McpServerRef", () => {
    const ref = makeMcpServerRef({
      source: {
        type: "registry",
        scope: "@acme",
        name: "code-review",
        versionConstraint: Option.none(),
      },
      location: "file:///registry/extensions/@acme/mcp-servers/my-server",
      version: Option.some("2.0.0"),
    });
    expect(Option.isSome(ref.version)).toBe(true);
    expect(Option.getOrNull(ref.version)).toBe("2.0.0");
  });

  it("is None for generic git-sourced refs", () => {
    const ref = makeSkillRef({
      source: { type: "git", url: new URL("https://example.com/repo.git"), ref: Option.none() },
      version: Option.none(),
    });
    expect(Option.isNone(ref.version)).toBe(true);
  });
});
