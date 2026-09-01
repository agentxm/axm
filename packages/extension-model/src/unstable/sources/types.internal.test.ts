/**
 * Tests for source domain types.
 *
 * Verifies discriminator-based narrowing and structural equality,
 * and type contracts for SourceHost, SourceParams, and Source.
 */

import * as Equal from "effect/Equal";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import type {
  ConfiguredSourceHost,
  GitHostingSourceHost,
  Source,
  RefType,
  SelfDescribingSourceHost,
  SourceHost,
  SourceParams,
  SourceType,
} from "./types.js";

// -----------------------------------------------------------------------------
// SourceType
// -----------------------------------------------------------------------------

describe("SourceType", () => {
  it("includes all 9 members", () => {
    const types: SourceType[] = [
      "github",
      "gitlab",
      "bitbucket",
      "azurerepos",
      "git",
      "registry",
      "local",
      "inline",
      "workspace",
    ];
    expect(types).toHaveLength(9);
  });
});

// -----------------------------------------------------------------------------
// RefType
// -----------------------------------------------------------------------------

describe("RefType", () => {
  it("includes all 4 members", () => {
    const types: RefType[] = ["git-hosted", "registry", "local", "workspace"];
    expect(types).toHaveLength(4);
  });
});

// -----------------------------------------------------------------------------
// SourceHost
// -----------------------------------------------------------------------------

describe("SourceHost", () => {
  it("narrows GitHubSourceHost via type", () => {
    const host: SourceHost = { type: "github", name: "github", url: new URL("https://github.com") };
    if (host.type === "github") {
      expect(host.url.hostname).toBe("github.com");
    }
  });

  it("narrows GitLabSourceHost via type", () => {
    const host: SourceHost = { type: "gitlab", name: "gitlab", url: new URL("https://gitlab.com") };
    if (host.type === "gitlab") {
      expect(host.url.hostname).toBe("gitlab.com");
    }
  });

  it("narrows BitbucketSourceHost via type", () => {
    const host: SourceHost = {
      type: "bitbucket",
      name: "bitbucket",
      url: new URL("https://bitbucket.org"),
    };
    if (host.type === "bitbucket") {
      expect(host.url.hostname).toBe("bitbucket.org");
    }
  });

  it("narrows AzureReposSourceHost via type", () => {
    const host: SourceHost = {
      type: "azurerepos",
      name: "azurerepos",
      url: new URL("https://dev.azure.com"),
    };
    if (host.type === "azurerepos") {
      expect(host.url.hostname).toBe("dev.azure.com");
    }
  });

  it("narrows RegistrySourceHost via type", () => {
    const host: SourceHost = {
      type: "registry",
      name: "agentxm",
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
      owner: Option.none(),
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
});

// -----------------------------------------------------------------------------
// Source (flat intersection)
// -----------------------------------------------------------------------------

describe("Source", () => {
  it("GitHubSource has host and params fields via flat intersection", () => {
    const source: Source = {
      type: "github",
      name: "github",
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
      name: "agentxm",
      location: new URL("file:///registry"),
      owner: Option.none(),
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

  it("switch (source.type) gives access to all fields", () => {
    const source: Source = {
      type: "azurerepos",
      name: "azurerepos",
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
      { type: "github", name: "github", url: new URL("https://github.com") },
      { type: "gitlab", name: "gitlab", url: new URL("https://gitlab.com") },
      { type: "bitbucket", name: "bitbucket", url: new URL("https://bitbucket.org") },
      { type: "azurerepos", name: "azurerepos", url: new URL("https://dev.azure.com") },
    ];
    expect(hosts).toHaveLength(4);
  });

  it("ConfiguredSourceHost includes git hosting + registry", () => {
    const hosts: ConfiguredSourceHost[] = [
      { type: "github", name: "github", url: new URL("https://github.com") },
      { type: "registry", name: "agentxm", location: new URL("file:///r") },
    ];
    expect(hosts).toHaveLength(2);
  });

  it("SelfDescribingSourceHost includes git and local", () => {
    const hosts: SelfDescribingSourceHost[] = [{ type: "git" }, { type: "local" }];
    expect(hosts).toHaveLength(2);
  });
});

// -----------------------------------------------------------------------------
// SourceParams structural equality
// -----------------------------------------------------------------------------

describe("SourceParams structural equality", () => {
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
    expect(Equal.equals(a, b)).toBe(true);
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
    expect(Equal.equals(a, b)).toBe(false);
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
    expect(Equal.equals(a, b)).toBe(false);
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
    expect(Equal.equals(a, b)).toBe(false);
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
    expect(Equal.equals(a, b)).toBe(true);
  });

  it("RegistrySourceParams has no additional fields", () => {
    const a: SourceParams = {
      type: "registry",
      owner: Option.none(),
    };
    const b: SourceParams = {
      type: "registry",
      owner: Option.none(),
    };
    expect(Equal.equals(a, b)).toBe(true);
  });

  it("LocalSourceParams compares path", () => {
    const a: SourceParams = { type: "local", path: "/a" };
    const b: SourceParams = { type: "local", path: "/a" };
    expect(Equal.equals(a, b)).toBe(true);
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
    expect(Equal.equals(a, b)).toBe(false);
  });
});
