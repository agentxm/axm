/**
 * Tests for source domain types.
 *
 * Verifies discriminator-based narrowing, structural equality via Data.struct,
 * and type contracts for SourceHost, SourceParams, Source, and extension refs.
 */

import * as Data from "effect/Data";
import * as Equal from "effect/Equal";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import type {
  BuiltinPackRef,
  BuiltinRefDetails,
  ConfiguredSourceHost,
  FindableExtensionType,
  GitHostedRefDetails,
  GitHostingSourceHost,
  LocalRefDetails,
  LocalSkillRef,
  McpServerExtensionRef,
  NewSource,
  PackExtensionRef,
  RegistryMcpServerRef,
  RegistryPackRef,
  RegistryRefDetails,
  RegistrySkillRef,
  SelfDescribingSourceHost,
  SkillExtensionRef,
  SourceExtensionRef,
  SourceHost,
  SourceParams,
  SourceType,
} from "./types.js";

// -----------------------------------------------------------------------------
// SourceType
// -----------------------------------------------------------------------------

describe("SourceType", () => {
  it("includes all 8 members", () => {
    const types: SourceType[] = [
      "github",
      "gitlab",
      "bitbucket",
      "azurerepos",
      "git",
      "registry",
      "local",
      "builtin",
    ];
    expect(types).toHaveLength(8);
  });
});

// -----------------------------------------------------------------------------
// SourceHost
// -----------------------------------------------------------------------------

describe("SourceHost", () => {
  it("narrows GitHubSourceHost via type", () => {
    const host: SourceHost = { type: "github", url: new URL("https://github.com") };
    if (host.type === "github") {
      expect(host.url.hostname).toBe("github.com");
    }
  });

  it("narrows GitLabSourceHost via type", () => {
    const host: SourceHost = { type: "gitlab", url: new URL("https://gitlab.com") };
    if (host.type === "gitlab") {
      expect(host.url.hostname).toBe("gitlab.com");
    }
  });

  it("narrows BitbucketSourceHost via type", () => {
    const host: SourceHost = { type: "bitbucket", url: new URL("https://bitbucket.org") };
    if (host.type === "bitbucket") {
      expect(host.url.hostname).toBe("bitbucket.org");
    }
  });

  it("narrows AzureReposSourceHost via type", () => {
    const host: SourceHost = { type: "azurerepos", url: new URL("https://dev.azure.com") };
    if (host.type === "azurerepos") {
      expect(host.url.hostname).toBe("dev.azure.com");
    }
  });

  it("narrows RegistrySourceHost via type", () => {
    const host: SourceHost = {
      type: "registry",
      url: new URL("file:///registry"),
      scopes: Option.some(["@acme"]),
    };
    if (host.type === "registry") {
      expect(host.url.protocol).toBe("file:");
      expect(Option.getOrNull(host.scopes)).toEqual(["@acme"]);
    }
  });

  it("narrows GitSourceHost via type (self-describing)", () => {
    const host: SourceHost = { type: "git" };
    expect(host.type).toBe("git");
  });

  it("narrows LocalSourceHost via type (self-describing)", () => {
    const host: SourceHost = { type: "local" };
    expect(host.type).toBe("local");
  });

  it("narrows BuiltinSourceHost via type (self-describing)", () => {
    const host: SourceHost = { type: "builtin" };
    expect(host.type).toBe("builtin");
  });
});

// -----------------------------------------------------------------------------
// SourceParams
// -----------------------------------------------------------------------------

describe("SourceParams", () => {
  it("narrows GitHubSourceParams via type", () => {
    const params: SourceParams = {
      type: "github",
      owner: "octocat",
      repo: "hello-world",
      ref: Option.some("main"),
      subPath: Option.none(),
    };
    if (params.type === "github") {
      expect(params.owner).toBe("octocat");
      expect(params.repo).toBe("hello-world");
      expect(Option.getOrNull(params.ref)).toBe("main");
    }
  });

  it("narrows GitLabSourceParams via type", () => {
    const params: SourceParams = {
      type: "gitlab",
      owner: "group",
      repo: "project",
      ref: Option.none(),
      subPath: Option.some("sub/path"),
    };
    if (params.type === "gitlab") {
      expect(params.owner).toBe("group");
      expect(Option.getOrNull(params.subPath)).toBe("sub/path");
    }
  });

  it("narrows BitbucketSourceParams via type", () => {
    const params: SourceParams = {
      type: "bitbucket",
      owner: "workspace",
      repo: "slug",
      ref: Option.none(),
      subPath: Option.none(),
    };
    if (params.type === "bitbucket") {
      expect(params.owner).toBe("workspace");
    }
  });

  it("narrows AzureReposSourceParams via type with all 3 fields", () => {
    const params: SourceParams = {
      type: "azurerepos",
      organization: "myorg",
      project: "myproject",
      repo: "myrepo",
      ref: Option.none(),
      subPath: Option.none(),
    };
    if (params.type === "azurerepos") {
      expect(params.organization).toBe("myorg");
      expect(params.project).toBe("myproject");
      expect(params.repo).toBe("myrepo");
    }
  });

  it("narrows GitSourceParams via type", () => {
    const params: SourceParams = {
      type: "git",
      url: new URL("git://example.com/repo.git"),
      ref: Option.some("v1.0"),
    };
    if (params.type === "git") {
      expect(params.url.protocol).toBe("git:");
    }
  });

  it("narrows RegistrySourceParams via type", () => {
    const params: SourceParams = {
      type: "registry",
      scope: "@acme",
      name: "code-review",
      versionConstraint: Option.some("^1.0.0"),
    };
    if (params.type === "registry") {
      expect(params.scope).toBe("@acme");
      expect(params.name).toBe("code-review");
    }
  });

  it("narrows LocalSourceParams via type", () => {
    const params: SourceParams = { type: "local", path: "/home/user/skill" };
    if (params.type === "local") {
      expect(params.path).toBe("/home/user/skill");
    }
  });

  it("narrows BuiltinSourceParams via type", () => {
    const params: SourceParams = { type: "builtin" };
    expect(params.type).toBe("builtin");
  });
});

// -----------------------------------------------------------------------------
// NewSource (flat intersection)
// -----------------------------------------------------------------------------

describe("NewSource", () => {
  it("GitHubSource has host and params fields via flat intersection", () => {
    const source: NewSource = {
      type: "github",
      url: new URL("https://github.com"),
      owner: "octocat",
      repo: "hello-world",
      ref: Option.none(),
      subPath: Option.none(),
    };
    if (source.type === "github") {
      expect(source.url.hostname).toBe("github.com");
      expect(source.owner).toBe("octocat");
      expect(source.repo).toBe("hello-world");
    }
  });

  it("RegistrySource has host and params fields via flat intersection", () => {
    const source: NewSource = {
      type: "registry",
      url: new URL("file:///registry"),
      scopes: Option.none(),
      scope: "@acme",
      name: "code-review",
      versionConstraint: Option.none(),
    };
    if (source.type === "registry") {
      expect(source.url.protocol).toBe("file:");
      expect(Option.isNone(source.scopes)).toBe(true);
      expect(source.scope).toBe("@acme");
    }
  });

  it("LocalSource has host and params fields", () => {
    const source: NewSource = { type: "local", path: "/home/user/skill" };
    if (source.type === "local") {
      expect(source.path).toBe("/home/user/skill");
    }
  });

  it("BuiltinSource is type-only", () => {
    const source: NewSource = { type: "builtin" };
    expect(source.type).toBe("builtin");
  });

  it("switch (source.type) gives access to all fields", () => {
    const source: NewSource = {
      type: "azurerepos",
      url: new URL("https://dev.azure.com"),
      organization: "myorg",
      project: "myproject",
      repo: "myrepo",
      ref: Option.none(),
      subPath: Option.none(),
    };
    switch (source.type) {
      case "azurerepos":
        expect(source.organization).toBe("myorg");
        expect(source.project).toBe("myproject");
        expect(source.repo).toBe("myrepo");
        expect(source.url.hostname).toBe("dev.azure.com");
        break;
      default:
        throw new Error("Expected azurerepos");
    }
  });
});

// -----------------------------------------------------------------------------
// Convenience unions
// -----------------------------------------------------------------------------

describe("convenience unions", () => {
  it("GitHostingSourceHost includes all 4 git hosting types", () => {
    const hosts: GitHostingSourceHost[] = [
      { type: "github", url: new URL("https://github.com") },
      { type: "gitlab", url: new URL("https://gitlab.com") },
      { type: "bitbucket", url: new URL("https://bitbucket.org") },
      { type: "azurerepos", url: new URL("https://dev.azure.com") },
    ];
    expect(hosts).toHaveLength(4);
  });

  it("ConfiguredSourceHost includes git hosting + registry", () => {
    const hosts: ConfiguredSourceHost[] = [
      { type: "github", url: new URL("https://github.com") },
      { type: "registry", url: new URL("file:///r"), scopes: Option.none() },
    ];
    expect(hosts).toHaveLength(2);
  });

  it("SelfDescribingSourceHost includes git, local, builtin", () => {
    const hosts: SelfDescribingSourceHost[] = [
      { type: "git" },
      { type: "local" },
      { type: "builtin" },
    ];
    expect(hosts).toHaveLength(3);
  });
});

// -----------------------------------------------------------------------------
// FindableExtensionType
// -----------------------------------------------------------------------------

describe("FindableExtensionType", () => {
  it("includes skill, pack, mcp-server", () => {
    const types: FindableExtensionType[] = ["skill", "pack", "mcp-server"];
    expect(types).toHaveLength(3);
  });
});

// -----------------------------------------------------------------------------
// Ref detail interfaces
// -----------------------------------------------------------------------------

describe("ref detail interfaces", () => {
  it("GitHostedRefDetails has location and gitTreeSha", () => {
    const details: GitHostedRefDetails = {
      location: "file:///tmp/clone",
      gitTreeSha: Option.some("abc123"),
    };
    expect(details.location).toBe("file:///tmp/clone");
    expect(Option.getOrNull(details.gitTreeSha)).toBe("abc123");
  });

  it("RegistryRefDetails has version and checksum", () => {
    const details: RegistryRefDetails = {
      version: "1.2.3",
      checksum: "sha256:abc",
    };
    expect(details.version).toBe("1.2.3");
    expect(details.checksum).toBe("sha256:abc");
  });

  it("LocalRefDetails has location", () => {
    const details: LocalRefDetails = { location: "file:///home/user/skill" };
    expect(details.location).toBe("file:///home/user/skill");
  });

  it("BuiltinRefDetails is empty", () => {
    const details: BuiltinRefDetails = {};
    expect(details).toEqual({});
  });
});

// -----------------------------------------------------------------------------
// SkillExtensionRef
// -----------------------------------------------------------------------------

describe("SkillExtensionRef", () => {
  it("GitHubSkillRef narrows correctly", () => {
    const ref: SkillExtensionRef = {
      type: "skill",
      skill: { name: "test", description: "desc", metadata: Option.none() },
      source: {
        type: "github",
        url: new URL("https://github.com"),
        owner: "o",
        repo: "r",
        ref: Option.none(),
        subPath: Option.none(),
      },
      location: "file:///tmp/clone",
      gitTreeSha: Option.some("sha1"),
    };
    expect(ref.source.type).toBe("github");
    if (ref.source.type === "github") {
      expect(ref.source.owner).toBe("o");
    }
  });

  it("RegistrySkillRef carries version and checksum", () => {
    const ref: SkillExtensionRef = {
      type: "skill",
      skill: { name: "test", description: "desc", metadata: Option.none() },
      source: {
        type: "registry",
        url: new URL("file:///reg"),
        scopes: Option.none(),
        scope: "@acme",
        name: "test",
        versionConstraint: Option.none(),
      },
      version: "1.0.0",
      checksum: "sha256:abc",
    };
    if (ref.source.type === "registry") {
      expect((ref as RegistrySkillRef).version).toBe("1.0.0");
      expect((ref as RegistrySkillRef).checksum).toBe("sha256:abc");
    }
  });

  it("LocalSkillRef carries location", () => {
    const ref: SkillExtensionRef = {
      type: "skill",
      skill: { name: "test", description: "desc", metadata: Option.none() },
      source: { type: "local", path: "/home/user/skill" },
      location: "file:///home/user/skill",
    };
    expect(ref.source.type).toBe("local");
    expect((ref as LocalSkillRef).location).toBe("file:///home/user/skill");
  });

  it("BuiltinSkillRef has no extra details", () => {
    const ref: SkillExtensionRef = {
      type: "skill",
      skill: { name: "builtin-skill", description: "desc", metadata: Option.none() },
      source: { type: "builtin" },
    };
    expect(ref.source.type).toBe("builtin");
  });
});

// -----------------------------------------------------------------------------
// McpServerExtensionRef
// -----------------------------------------------------------------------------

describe("McpServerExtensionRef", () => {
  it("GitHubMcpServerRef narrows correctly", () => {
    const ref: McpServerExtensionRef = {
      type: "mcp-server",
      server: { name: "my-server" },
      source: {
        type: "github",
        url: new URL("https://github.com"),
        owner: "o",
        repo: "r",
        ref: Option.none(),
        subPath: Option.none(),
      },
      location: "file:///tmp/clone",
      gitTreeSha: Option.none(),
    };
    expect(ref.source.type).toBe("github");
  });

  it("RegistryMcpServerRef carries version and checksum", () => {
    const ref: McpServerExtensionRef = {
      type: "mcp-server",
      server: { name: "my-server" },
      source: {
        type: "registry",
        url: new URL("file:///reg"),
        scopes: Option.none(),
        scope: "@acme",
        name: "test",
        versionConstraint: Option.none(),
      },
      version: "2.0.0",
      checksum: "sha256:def",
    };
    expect((ref as RegistryMcpServerRef).version).toBe("2.0.0");
  });
});

// -----------------------------------------------------------------------------
// PackExtensionRef
// -----------------------------------------------------------------------------

describe("PackExtensionRef", () => {
  it("RegistryPackRef carries version and checksum", () => {
    const ref: PackExtensionRef = {
      type: "pack",
      source: {
        type: "registry",
        url: new URL("file:///reg"),
        scopes: Option.none(),
        scope: "@acme",
        name: "my-pack",
        versionConstraint: Option.none(),
      },
      version: "1.0.0",
      checksum: "sha256:ghi",
    };
    expect(ref.source.type).toBe("registry");
    expect((ref as RegistryPackRef).version).toBe("1.0.0");
  });

  it("BuiltinPackRef has pack info", () => {
    const ref: PackExtensionRef = {
      type: "pack",
      pack: { scope: "@builtin", name: "default", version: "0.1.0" },
      source: { type: "builtin" },
    };
    expect(ref.source.type).toBe("builtin");
    expect((ref as BuiltinPackRef).pack.name).toBe("default");
  });
});

// -----------------------------------------------------------------------------
// SourceExtensionRef union
// -----------------------------------------------------------------------------

describe("SourceExtensionRef", () => {
  it("narrows to SkillExtensionRef via type", () => {
    const ref: SourceExtensionRef = {
      type: "skill",
      skill: { name: "test", description: "desc", metadata: Option.none() },
      source: { type: "local", path: "/test" },
      location: "file:///test",
    };
    if (ref.type === "skill") {
      expect(ref.skill.name).toBe("test");
    }
  });

  it("narrows to McpServerExtensionRef via type", () => {
    const ref: SourceExtensionRef = {
      type: "mcp-server",
      server: { name: "srv" },
      source: { type: "builtin" },
    };
    if (ref.type === "mcp-server") {
      expect(ref.server.name).toBe("srv");
    }
  });

  it("narrows to PackExtensionRef via type", () => {
    const ref: SourceExtensionRef = {
      type: "pack",
      pack: { scope: "@b", name: "p", version: "1.0.0" },
      source: { type: "builtin" },
    };
    if (ref.type === "pack") {
      expect((ref as BuiltinPackRef).pack.name).toBe("p");
    }
  });
});

// -----------------------------------------------------------------------------
// SourceParams structural equality via Data.struct
// -----------------------------------------------------------------------------

describe("SourceParams structural equality via Data.struct", () => {
  it("equal GitHubSourceParams are structurally equal", () => {
    const a: SourceParams = {
      type: "github",
      owner: "o",
      repo: "r",
      ref: Option.some("main"),
      subPath: Option.none(),
    };
    const b: SourceParams = {
      type: "github",
      owner: "o",
      repo: "r",
      ref: Option.some("main"),
      subPath: Option.none(),
    };
    expect(Equal.equals(Data.struct(a), Data.struct(b))).toBe(true);
  });

  it("different GitHubSourceParams are not equal", () => {
    const a: SourceParams = {
      type: "github",
      owner: "o",
      repo: "r",
      ref: Option.none(),
      subPath: Option.none(),
    };
    const b: SourceParams = {
      type: "github",
      owner: "o",
      repo: "other",
      ref: Option.none(),
      subPath: Option.none(),
    };
    expect(Equal.equals(Data.struct(a), Data.struct(b))).toBe(false);
  });

  it("different source types are not equal", () => {
    const a: SourceParams = {
      type: "github",
      owner: "o",
      repo: "r",
      ref: Option.none(),
      subPath: Option.none(),
    };
    const b: SourceParams = {
      type: "gitlab",
      owner: "o",
      repo: "r",
      ref: Option.none(),
      subPath: Option.none(),
    };
    expect(Equal.equals(Data.struct(a), Data.struct(b))).toBe(false);
  });

  it("AzureRepos compares all 3 fields (bug fix)", () => {
    const a: SourceParams = {
      type: "azurerepos",
      organization: "org",
      project: "proj",
      repo: "repo",
      ref: Option.none(),
      subPath: Option.none(),
    };
    const b: SourceParams = {
      type: "azurerepos",
      organization: "org",
      project: "different-proj",
      repo: "repo",
      ref: Option.none(),
      subPath: Option.none(),
    };
    expect(Equal.equals(Data.struct(a), Data.struct(b))).toBe(false);
  });

  it("AzureRepos equal when all fields match", () => {
    const a: SourceParams = {
      type: "azurerepos",
      organization: "org",
      project: "proj",
      repo: "repo",
      ref: Option.some("main"),
      subPath: Option.none(),
    };
    const b: SourceParams = {
      type: "azurerepos",
      organization: "org",
      project: "proj",
      repo: "repo",
      ref: Option.some("main"),
      subPath: Option.none(),
    };
    expect(Equal.equals(Data.struct(a), Data.struct(b))).toBe(true);
  });

  it("RegistrySourceParams compares scope and name", () => {
    const a: SourceParams = {
      type: "registry",
      scope: "@acme",
      name: "code-review",
      versionConstraint: Option.none(),
    };
    const b: SourceParams = {
      type: "registry",
      scope: "@acme",
      name: "other-skill",
      versionConstraint: Option.none(),
    };
    expect(Equal.equals(Data.struct(a), Data.struct(b))).toBe(false);
  });

  it("LocalSourceParams compares path", () => {
    const a: SourceParams = { type: "local", path: "/a" };
    const b: SourceParams = { type: "local", path: "/a" };
    expect(Equal.equals(Data.struct(a), Data.struct(b))).toBe(true);
  });

  it("BuiltinSourceParams are equal", () => {
    const a: SourceParams = { type: "builtin" };
    const b: SourceParams = { type: "builtin" };
    expect(Equal.equals(Data.struct(a), Data.struct(b))).toBe(true);
  });

  it("Option.some refs compare correctly", () => {
    const a: SourceParams = {
      type: "github",
      owner: "o",
      repo: "r",
      ref: Option.some("v1"),
      subPath: Option.none(),
    };
    const b: SourceParams = {
      type: "github",
      owner: "o",
      repo: "r",
      ref: Option.some("v2"),
      subPath: Option.none(),
    };
    expect(Equal.equals(Data.struct(a), Data.struct(b))).toBe(false);
  });
});
