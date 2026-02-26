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
  ExtensionRef,
  GitHostedRefDetails,
  GitHostingSourceHost,
  LocalRefDetails,
  McpServerExtensionRef,
  Source,
  PackExtensionRef,
  RefType,
  RegistryMcpServerRef,
  RegistryPackRef,
  RegistryRefDetails,
  SelfDescribingSourceHost,
  SkillExtensionRef,
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
// RefType
// -----------------------------------------------------------------------------

describe("RefType", () => {
  it("includes all 4 members", () => {
    const types: RefType[] = ["git-hosted", "registry", "local", "builtin"];
    expect(types).toHaveLength(4);
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
      location: new URL("file:///registry"),
    };
    if (host.type === "registry") {
      expect(host.location.protocol).toBe("file:");
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
      namespace: Option.none(),
    };
    if (params.type === "registry") {
      expect(params.type).toBe("registry");
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
// Source (flat intersection)
// -----------------------------------------------------------------------------

describe("Source", () => {
  it("GitHubSource has host and params fields via flat intersection", () => {
    const source: Source = {
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
    const source: Source = {
      type: "registry",
      location: new URL("file:///registry"),
      namespace: Option.none(),
    };
    if (source.type === "registry") {
      expect(source.location.protocol).toBe("file:");
    }
  });

  it("LocalSource has host and params fields", () => {
    const source: Source = { type: "local", path: "/home/user/skill" };
    if (source.type === "local") {
      expect(source.path).toBe("/home/user/skill");
    }
  });

  it("BuiltinSource is type-only", () => {
    const source: Source = { type: "builtin" };
    expect(source.type).toBe("builtin");
  });

  it("switch (source.type) gives access to all fields", () => {
    const source: Source = {
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
      { type: "registry", location: new URL("file:///r") },
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

  it("RegistryRefDetails has namespace, name, version, and integrity", () => {
    const details: RegistryRefDetails = {
      namespace: "@acme",
      name: "my-skill",
      version: "1.2.3",
      integrity: "sha512-abc==",
    };
    expect(details.namespace).toBe("@acme");
    expect(details.name).toBe("my-skill");
    expect(details.version).toBe("1.2.3");
    expect(details.integrity).toBe("sha512-abc==");
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
  it("GitHostedSkillRef narrows via refType", () => {
    const ref: SkillExtensionRef = {
      type: "skill",
      refType: "git-hosted",
      skill: { name: "test", description: Option.some("desc"), metadata: Option.none() },
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
    if (ref.refType === "git-hosted") {
      expect(ref.location).toBe("file:///tmp/clone");
      expect(Option.getOrNull(ref.gitTreeSha)).toBe("sha1");
      if (ref.source.type === "github") {
        expect(ref.source.owner).toBe("o");
      }
    }
  });

  it("RegistrySkillRef carries version and integrity via refType narrowing", () => {
    const ref: SkillExtensionRef = {
      type: "skill",
      refType: "registry",
      skill: { name: "test", description: Option.none(), metadata: Option.none() },
      source: {
        type: "registry",
        location: new URL("file:///reg"),
        namespace: Option.none(),
      },
      namespace: "@acme",
      name: "test-pkg",
      version: "1.0.0",
      integrity: "sha512-abc",
    };
    if (ref.refType === "registry") {
      expect(ref.version).toBe("1.0.0");
      expect(ref.integrity).toBe("sha512-abc");
      expect(ref.name).toBe("test-pkg");
      expect(ref.namespace).toBe("@acme");
    }
  });

  it("LocalSkillRef carries location via refType narrowing", () => {
    const ref: SkillExtensionRef = {
      type: "skill",
      refType: "local",
      skill: { name: "test", description: Option.some("desc"), metadata: Option.none() },
      source: { type: "local", path: "/home/user/skill" },
      location: "file:///home/user/skill",
    };
    if (ref.refType === "local") {
      expect(ref.location).toBe("file:///home/user/skill");
    }
  });

  it("BuiltinSkillRef has no extra details", () => {
    const ref: SkillExtensionRef = {
      type: "skill",
      refType: "builtin",
      skill: { name: "builtin-skill", description: Option.none(), metadata: Option.none() },
      source: { type: "builtin" },
    };
    expect(ref.refType).toBe("builtin");
    expect(ref.source.type).toBe("builtin");
  });

  it("skill.description is Option<string>", () => {
    const withDesc: SkillExtensionRef = {
      type: "skill",
      refType: "builtin",
      skill: { name: "s", description: Option.some("hello"), metadata: Option.none() },
      source: { type: "builtin" },
    };
    const withoutDesc: SkillExtensionRef = {
      type: "skill",
      refType: "builtin",
      skill: { name: "s", description: Option.none(), metadata: Option.none() },
      source: { type: "builtin" },
    };
    expect(Option.getOrNull(withDesc.skill.description)).toBe("hello");
    expect(Option.getOrNull(withoutDesc.skill.description)).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// McpServerExtensionRef
// -----------------------------------------------------------------------------

describe("McpServerExtensionRef", () => {
  it("GitHostedMcpServerRef narrows via refType", () => {
    const ref: McpServerExtensionRef = {
      type: "mcp-server",
      refType: "git-hosted",
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
    if (ref.refType === "git-hosted") {
      expect(ref.location).toBe("file:///tmp/clone");
    }
  });

  it("RegistryMcpServerRef carries version and integrity via refType narrowing", () => {
    const ref: McpServerExtensionRef = {
      type: "mcp-server",
      refType: "registry",
      server: { name: "my-server" },
      source: {
        type: "registry",
        location: new URL("file:///reg"),
        namespace: Option.none(),
      },
      namespace: "@acme",
      name: "server-pkg",
      version: "2.0.0",
      integrity: "sha512-def",
    };
    if (ref.refType === "registry") {
      expect((ref as RegistryMcpServerRef).version).toBe("2.0.0");
      expect(ref.name).toBe("server-pkg");
    }
  });
});

// -----------------------------------------------------------------------------
// PackExtensionRef
// -----------------------------------------------------------------------------

describe("PackExtensionRef", () => {
  it("RegistryPackRef carries version and integrity via refType narrowing", () => {
    const ref: PackExtensionRef = {
      type: "pack",
      refType: "registry",
      pack: { name: "my-pack", skills: {}, commands: {}, mcpServers: {} },
      source: {
        type: "registry",
        location: new URL("file:///reg"),
        namespace: Option.none(),
      },
      namespace: "@acme",
      name: "pack-pkg",
      version: "1.0.0",
      integrity: "sha512-ghi",
    };
    if (ref.refType === "registry") {
      expect((ref as RegistryPackRef).version).toBe("1.0.0");
      expect(ref.name).toBe("pack-pkg");
    }
  });

  it("BuiltinPackRef has pack name and namespace", () => {
    const ref: PackExtensionRef = {
      type: "pack",
      refType: "builtin",
      namespace: "@axm",
      pack: { name: "default", skills: {}, commands: {}, mcpServers: {} },
      source: { type: "builtin" },
    };
    expect(ref.source.type).toBe("builtin");
    expect((ref as BuiltinPackRef).pack.name).toBe("default");
    expect(ref.namespace).toBe("@axm");
  });
});

// -----------------------------------------------------------------------------
// ExtensionRef union
// -----------------------------------------------------------------------------

describe("ExtensionRef", () => {
  it("narrows to SkillExtensionRef via type", () => {
    const ref: ExtensionRef = {
      type: "skill",
      refType: "local",
      skill: { name: "test", description: Option.some("desc"), metadata: Option.none() },
      source: { type: "local", path: "/test" },
      location: "file:///test",
    };
    if (ref.type === "skill") {
      expect(ref.skill.name).toBe("test");
    }
  });

  it("narrows to McpServerExtensionRef via type", () => {
    const ref: ExtensionRef = {
      type: "mcp-server",
      refType: "builtin",
      server: { name: "srv" },
      source: { type: "builtin" },
    };
    if (ref.type === "mcp-server") {
      expect(ref.server.name).toBe("srv");
    }
  });

  it("narrows to PackExtensionRef via type", () => {
    const ref: ExtensionRef = {
      type: "pack",
      refType: "builtin",
      namespace: "@axm",
      pack: { name: "p", skills: {}, commands: {}, mcpServers: {} },
      source: { type: "builtin" },
    };
    if (ref.type === "pack") {
      expect((ref as BuiltinPackRef).pack.name).toBe("p");
    }
  });

  it("narrows on refType to access ref details", () => {
    const ref: ExtensionRef = {
      type: "skill",
      refType: "registry",
      skill: { name: "s", description: Option.none(), metadata: Option.none() },
      source: { type: "registry", location: new URL("file:///reg"), namespace: Option.none() },
      namespace: "@acme",
      name: "pkg",
      version: "1.0.0",
      integrity: "sha512-abc",
    };
    if (ref.refType === "registry") {
      expect(ref.namespace).toBe("@acme");
      expect(ref.version).toBe("1.0.0");
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

  it("RegistrySourceParams has no additional fields", () => {
    const a: SourceParams = {
      type: "registry",
      namespace: Option.none(),
    };
    const b: SourceParams = {
      type: "registry",
      namespace: Option.none(),
    };
    expect(Equal.equals(Data.struct(a), Data.struct(b))).toBe(true);
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
