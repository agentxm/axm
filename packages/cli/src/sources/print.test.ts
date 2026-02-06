import { describe, expect, it } from "vitest";
import * as Option from "effect/Option";

import { printSource } from "./print.js";
import type {
  AzureReposSource,
  BitbucketSource,
  GitHubSource,
  GitLabSource,
  GitRepositorySource,
  LocalSource,
  RegistrySource,
} from "./types.js";

describe("printSource", () => {
  it("prints GitHub source", () => {
    const source: GitHubSource = {
      source: "github",
      owner: "my-org",
      repo: "my-repo",
      ref: Option.none(),
      subPath: Option.none(),
    };
    expect(printSource(source)).toBe("github:my-org/my-repo");
  });

  it("prints GitLab source", () => {
    const source: GitLabSource = {
      source: "gitlab",
      owner: "my-org",
      repo: "my-repo",
      ref: Option.some("main"),
      subPath: Option.none(),
    };
    expect(printSource(source)).toBe("gitlab:my-org/my-repo");
  });

  it("prints Bitbucket source", () => {
    const source: BitbucketSource = {
      source: "bitbucket",
      owner: "team",
      repo: "project",
      ref: Option.none(),
      subPath: Option.some("skills"),
    };
    expect(printSource(source)).toBe("bitbucket:team/project");
  });

  it("prints local source", () => {
    const source: LocalSource = { source: "local", path: "./my-skills" };
    expect(printSource(source)).toBe("local:./my-skills");
  });

  it("prints local source with absolute path", () => {
    const source: LocalSource = { source: "local", path: "/home/user/skills" };
    expect(printSource(source)).toBe("local:/home/user/skills");
  });

  it("prints Azure Repos source", () => {
    const source: AzureReposSource = {
      source: "azurerepos",
      organization: "myorg",
      project: "myproject",
      repo: "myrepo",
      ref: Option.none(),
      subPath: Option.none(),
    };
    expect(printSource(source)).toBe("azurerepos:myorg/myproject/myrepo");
  });

  it("prints git source with url", () => {
    const source: GitRepositorySource = {
      source: "git",
      url: "git://example.com/repo.git",
      ref: Option.none(),
    };
    expect(printSource(source)).toBe("git://example.com/repo.git");
  });

  it("prints git source with path", () => {
    const source: GitRepositorySource = {
      source: "git",
      path: "/local/repo.git",
      ref: Option.none(),
    };
    expect(printSource(source)).toBe("/local/repo.git");
  });

  it("prints registry source with url", () => {
    const source: RegistrySource = {
      source: "registry",
      url: "https://registry.example.com/pkg",
    };
    expect(printSource(source)).toBe("https://registry.example.com/pkg");
  });

  it("prints registry source with path", () => {
    const source: RegistrySource = {
      source: "registry",
      path: "/local/registry/pkg",
    };
    expect(printSource(source)).toBe("/local/registry/pkg");
  });
});
