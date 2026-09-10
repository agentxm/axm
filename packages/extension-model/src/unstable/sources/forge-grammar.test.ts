import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";

import type { AzureReposSourceParams, GitHubSourceParams } from "./types.js";
import {
  printAzureReposSource,
  printBitbucketSource,
  printGitHubSource,
  printGitLabSource,
  printLocalSource,
} from "./forge-grammar.js";

const makeGitHosted = (
  overrides: Partial<Pick<GitHubSourceParams, "owner" | "repo">> & {
    ref?: string;
    subPath?: string;
  } = {},
) => ({
  owner: overrides.owner ?? "acme",
  repo: overrides.repo ?? "widgets",
  ref: Option.fromUndefinedOr(overrides.ref),
  subPath: Option.fromUndefinedOr(overrides.subPath),
});

describe("printGitHubSource", () => {
  it("formats owner/repo", () => {
    expect(printGitHubSource({ type: "github", ...makeGitHosted() })).toBe("github:acme/widgets");
  });

  it("formats with subPath", () => {
    expect(printGitHubSource({ type: "github", ...makeGitHosted({ subPath: "src/lib" }) })).toBe(
      "github:acme/widgets//src/lib",
    );
  });

  it("formats with ref", () => {
    expect(printGitHubSource({ type: "github", ...makeGitHosted({ ref: "v1.0.0" }) })).toBe(
      "github:acme/widgets@v1.0.0",
    );
  });

  it("formats with subPath and ref", () => {
    expect(
      printGitHubSource({ type: "github", ...makeGitHosted({ subPath: "src/lib", ref: "v2" }) }),
    ).toBe("github:acme/widgets//src/lib@v2");
  });
});

describe("printGitLabSource", () => {
  it("formats owner/repo", () => {
    expect(printGitLabSource({ type: "gitlab", ...makeGitHosted() })).toBe("gitlab:acme/widgets");
  });

  it("formats with subPath and ref", () => {
    expect(
      printGitLabSource({ type: "gitlab", ...makeGitHosted({ subPath: "src/lib", ref: "v2" }) }),
    ).toBe("gitlab:acme/widgets//src/lib@v2");
  });
});

describe("printBitbucketSource", () => {
  it("formats owner/repo", () => {
    expect(printBitbucketSource({ type: "bitbucket", ...makeGitHosted() })).toBe(
      "bitbucket:acme/widgets",
    );
  });

  it("formats with subPath and ref", () => {
    expect(
      printBitbucketSource({
        type: "bitbucket",
        ...makeGitHosted({ subPath: "src/lib", ref: "v2" }),
      }),
    ).toBe("bitbucket:acme/widgets//src/lib@v2");
  });
});

const makeAzureRepos = (
  overrides: Partial<Pick<AzureReposSourceParams, "organization" | "project" | "repo">> & {
    ref?: string;
    subPath?: string;
  } = {},
): AzureReposSourceParams => ({
  type: "azurerepos",
  organization: overrides.organization ?? "myorg",
  project: overrides.project ?? "myproject",
  repo: overrides.repo ?? "myrepo",
  ref: Option.fromUndefinedOr(overrides.ref),
  subPath: Option.fromUndefinedOr(overrides.subPath),
});

describe("printAzureReposSource", () => {
  it("formats org/project/repo", () => {
    expect(printAzureReposSource(makeAzureRepos())).toBe("azurerepos:myorg/myproject/myrepo");
  });

  it("formats with subPath", () => {
    expect(printAzureReposSource(makeAzureRepos({ subPath: "src/lib" }))).toBe(
      "azurerepos:myorg/myproject/myrepo//src/lib",
    );
  });

  it("formats with ref", () => {
    expect(printAzureReposSource(makeAzureRepos({ ref: "v1.0.0" }))).toBe(
      "azurerepos:myorg/myproject/myrepo@v1.0.0",
    );
  });

  it("formats with subPath and ref", () => {
    expect(printAzureReposSource(makeAzureRepos({ subPath: "src/lib", ref: "v2" }))).toBe(
      "azurerepos:myorg/myproject/myrepo//src/lib@v2",
    );
  });
});

describe("printLocalSource", () => {
  it("formats local path", () => {
    expect(printLocalSource({ type: "local", path: "./my/skills" })).toBe("./my/skills");
  });

  it("keeps bare relative paths unambiguous", () => {
    expect(printLocalSource({ type: "local", path: "my/skills" })).toBe("./my/skills");
  });

  it("formats absolute path", () => {
    expect(printLocalSource({ type: "local", path: "/home/user/skills" })).toBe(
      "/home/user/skills",
    );
  });
});
