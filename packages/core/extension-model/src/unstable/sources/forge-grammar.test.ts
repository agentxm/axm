import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import * as Result from "effect/Result";

import type { AzureReposSourceParams, GitHubSourceParams } from "./types.js";
import {
  FORGE_PREFIXES,
  forgeCloneUrl,
  forgeCoordinateFromGitUrl,
  forgeForHostname,
  isForgePrefix,
  parseForgeBrowserUrl,
  parseForgeCoordinate,
  printForgeCoordinate,
  printForgeCoordinateBody,
  printAzureReposSource,
  printBitbucketSource,
  printGitHubSource,
  printGitLabSource,
  printLocalSource,
} from "./forge-grammar.js";

describe("forge coordinate grammar", () => {
  it("recognizes the four supported forges", () => {
    for (const prefix of FORGE_PREFIXES) expect(isForgePrefix(prefix)).toBe(true);
    expect(isForgePrefix("gitea")).toBe(false);
    expect(forgeForHostname("github.com")?.prefix).toBe("github");
    expect(forgeForHostname("example.com")).toBeUndefined();
  });

  it.each([
    ["github", "acme/widgets", "github:acme/widgets"],
    ["github", "acme/widgets@v1.0.0", "github:acme/widgets@v1.0.0"],
    ["github", "acme/widgets//src/lib", "github:acme/widgets//src/lib"],
    ["github", "acme/widgets//src/lib@v2", "github:acme/widgets//src/lib@v2"],
    [
      "github",
      "agentxm/community//agent_extensions/@community/mcps/linear",
      "github:agentxm/community//agent_extensions/@community/mcps/linear",
    ],
    ["github", "acme/widgets/src", "github:acme/widgets/src"],
    [
      "gitlab",
      "group/subgroup/widgets//packages/tool@v2",
      "gitlab:group/subgroup/widgets//packages/tool@v2",
    ],
    ["bitbucket", "acme/widgets//src/lib@v2", "bitbucket:acme/widgets//src/lib@v2"],
    ["azurerepos", "myorg/myproject/myrepo", "azurerepos:myorg/myproject/myrepo"],
    [
      "azurerepos",
      "myorg/myproject/myrepo//src/lib@v1.0.0",
      "azurerepos:myorg/myproject/myrepo//src/lib@v1.0.0",
    ],
  ] as const)("round-trips %s:%s", (forge, body, expected) => {
    const parsed = parseForgeCoordinate(forge, body);
    if (Result.isFailure(parsed)) throw new Error(parsed.failure.reason);
    expect(printForgeCoordinate(parsed.success)).toBe(expected);
    expect(printForgeCoordinateBody(parsed.success)).toBe(body);
  });

  it.each([
    ["github", "invalid"],
    ["github", "acme/widgets//../src"],
    ["github", "acme/widgets@"],
    ["azurerepos", "myorg/myproject/myrepo/extra"],
  ] as const)("rejects invalid %s:%s", (forge, body) => {
    expect(Result.isFailure(parseForgeCoordinate(forge, body))).toBe(true);
  });

  it.each([
    ["github", "acme/widgets", "https://github.com/acme/widgets.git"],
    ["gitlab", "group/subgroup/widgets", "https://gitlab.com/group/subgroup/widgets.git"],
    ["bitbucket", "acme/widgets", "https://bitbucket.org/acme/widgets.git"],
    ["azurerepos", "myorg/myproject/myrepo", "https://dev.azure.com/myorg/myproject/_git/myrepo"],
  ] as const)("maps %s clone URLs in both directions", (forge, repository, url) => {
    const parsed = parseForgeCoordinate(forge, repository);
    if (Result.isFailure(parsed)) throw new Error(parsed.failure.reason);
    expect(forgeCloneUrl(parsed.success).href).toBe(url);
    expect(forgeCoordinateFromGitUrl(new URL(`${url}/`), Option.none(), Option.none())).toEqual(
      Option.some(parsed.success),
    );
  });

  it.each([
    ["https://github.com/acme/widgets", "github:acme/widgets"],
    ["https://github.com/acme/widgets.git", "github:acme/widgets"],
    ["https://github.com/acme/widgets/tree/main", "github:acme/widgets@main"],
    ["https://github.com/acme/widgets/tree/main/src/lib", "github:acme/widgets//src/lib@main"],
    [
      "https://gitlab.com/group/subgroup/widgets/-/tree/main/src",
      "gitlab:group/subgroup/widgets//src@main",
    ],
    ["https://bitbucket.org/acme/widgets/src/main/src/lib", "bitbucket:acme/widgets//src/lib@main"],
    ["https://dev.azure.com/myorg/myproject/_git/myrepo", "azurerepos:myorg/myproject/myrepo"],
  ] as const)("parses browser path %s", (url, expected) => {
    const parsed = parseForgeBrowserUrl(new URL(url));
    if (Option.isNone(parsed)) throw new Error(`Could not parse ${url}`);
    expect(printForgeCoordinate(parsed.value)).toBe(expected);
  });

  it("rejects invalid and unknown browser paths", () => {
    expect(parseForgeBrowserUrl(new URL("https://github.com/invalid"))).toEqual(Option.none());
    expect(parseForgeBrowserUrl(new URL("https://example.com/acme/widgets"))).toEqual(
      Option.none(),
    );
  });
});

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
