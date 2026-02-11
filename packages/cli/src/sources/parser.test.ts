/**
 * Unit tests for source-parser module.
 *
 * Tests classification of input strings into InputPattern types.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { buildCloneUrl, getOrigin } from "./clone-url.js";
import { type InputPattern, parseInputPattern } from "./parser.js";

describe("parseInputPattern", () => {
  describe("classification", () => {
    const expectSome = (input: string, expected: InputPattern) => {
      const result = parseInputPattern(input);
      expect(Option.isSome(result)).toBe(true);
      expect(Option.getOrThrow(result)).toEqual(expected);
    };

    const expectNone = (input: string) => {
      expect(Option.isNone(parseInputPattern(input))).toBe(true);
    };

    it("classifies simple name as NameInput", () => {
      expectSome("some-name", { _tag: "NameInput", name: "some-name" });
    });

    it("classifies @scope/name as RegistryPatternInput", () => {
      expectSome("@myorg/some-name", {
        _tag: "RegistryPatternInput",
        scope: "myorg",
        name: "some-name",
      });
    });

    it("classifies https URL as UrlInput", () => {
      expectSome("https://github.com/owner/repo", {
        _tag: "UrlInput",
        url: new URL("https://github.com/owner/repo"),
      });
    });

    it("classifies file:// URL as FilePathPattern", () => {
      expectSome("file:///absolute/path/to/skill", {
        _tag: "FilePathPattern",
        path: "/absolute/path/to/skill",
      });
    });

    it("classifies file:// URL with nested path as FilePathPattern", () => {
      expectSome("file:///Users/dev/skills/my-skill", {
        _tag: "FilePathPattern",
        path: "/Users/dev/skills/my-skill",
      });
    });

    it("classifies git@ SCP-style address with .git suffix as GitScpAddress", () => {
      expectSome("git@github.com:owner/repo.git", {
        _tag: "GitScpAddress",
        user: "git",
        host: "github.com",
        path: "owner/repo.git",
      });
    });

    it("classifies git@ SCP-style address without .git suffix as GitScpAddress", () => {
      expectSome("git@github.com:owner/repo", {
        _tag: "GitScpAddress",
        user: "git",
        host: "github.com",
        path: "owner/repo",
      });
    });

    it("classifies owner/repo as SlashPattern", () => {
      expectSome("owner/repo", {
        _tag: "SlashPattern",
        owner: "owner",
        repo: "repo",
        subPath: Option.none(),
      });
    });

    it("returns None for slash pattern with more than two segments", () => {
      expectNone("owner/repo/sub/path");
    });

    it("returns None for slash pattern with invalid segment", () => {
      expectNone("owner/-repo");
    });

    it("returns None for slash pattern with trailing hyphen segment", () => {
      expectNone("owner/repo-");
    });

    it("classifies leading slash as FilePathPattern (not SlashPattern)", () => {
      expectSome("/owner/repo", { _tag: "FilePathPattern", path: "/owner/repo" });
    });

    it("returns None for slash pattern with trailing slash", () => {
      expectNone("owner/repo/");
    });

    it("returns None for slash pattern with empty segment", () => {
      expectNone("owner//repo");
    });

    it("returns None for slash pattern with special character segment", () => {
      expectNone("owner/repo_name");
    });

    it("classifies ./local/path as FilePathPattern", () => {
      expectSome("./local/path", { _tag: "FilePathPattern", path: "./local/path" });
    });

    it("classifies /absolute/path as FilePathPattern", () => {
      expectSome("/absolute/path", { _tag: "FilePathPattern", path: "/absolute/path" });
    });

    it("classifies ~/home/path as FilePathPattern", () => {
      expectSome("~/home/path", { _tag: "FilePathPattern", path: "~/home/path" });
    });

    it("classifies single character name as NameInput", () => {
      expectSome("a", { _tag: "NameInput", name: "a" });
    });

    it("returns None for name with leading hyphen", () => {
      expectNone("-foo");
    });

    it("returns None for name with trailing hyphen", () => {
      expectNone("foo-");
    });

    it("returns None for name with special characters", () => {
      expectNone("foo_bar");
    });

    it("classifies github:owner/repo as ShorthandInput", () => {
      expectSome("github:owner/repo", {
        _tag: "ShorthandInput",
        prefix: "github",
        input: "github:owner/repo",
      });
    });

    it("classifies gitlab:owner/repo@ref as ShorthandInput", () => {
      expectSome("gitlab:owner/repo@ref", {
        _tag: "ShorthandInput",
        prefix: "gitlab",
        input: "gitlab:owner/repo@ref",
      });
    });

    it("classifies bitbucket:owner/repo/path@ref as ShorthandInput", () => {
      expectSome("bitbucket:owner/repo/path@ref", {
        _tag: "ShorthandInput",
        prefix: "bitbucket",
        input: "bitbucket:owner/repo/path@ref",
      });
    });

    it("classifies local:./path as UrlInput (no longer a shorthand)", () => {
      const result = parseInputPattern("local:./path");
      expect(Option.isSome(result)).toBe(true);
      // local: is parsed as a URL scheme, no longer a shorthand prefix
      expect(Option.getOrThrow(result)._tag).toBe("UrlInput");
    });

    it("returns None for empty string", () => {
      expectNone("");
    });

    it("returns None for whitespace-only string", () => {
      expectNone("   ");
    });
  });
});

describe("buildCloneUrl", () => {
  it("builds GitHub clone URL from config url", async () => {
    const source = {
      type: "github",
      owner: "owner",
      repo: "repo",
      ref: Option.none(),
      subPath: Option.none(),
      name: "github",
      url: new URL("https://github.com"),
    } as const;

    const result = await Effect.runPromise(buildCloneUrl(source));

    expect(result).toBe("https://github.com/owner/repo.git");
  });

  it("builds GitHub clone URL with custom url", async () => {
    const source = {
      type: "github",
      owner: "owner",
      repo: "repo",
      ref: Option.none(),
      subPath: Option.none(),
      name: "my-ghe",
      url: new URL("https://github.example.com"),
    } as const;

    const result = await Effect.runPromise(buildCloneUrl(source));

    expect(result).toBe("https://github.example.com/owner/repo.git");
  });

  it("builds GitLab clone URL from config url", async () => {
    const source = {
      type: "gitlab",
      owner: "owner",
      repo: "repo",
      ref: Option.none(),
      subPath: Option.none(),
      name: "gitlab",
      url: new URL("https://gitlab.com"),
    } as const;

    const result = await Effect.runPromise(buildCloneUrl(source));

    expect(result).toBe("https://gitlab.com/owner/repo.git");
  });

  it("builds Bitbucket clone URL from config url", async () => {
    const source = {
      type: "bitbucket",
      owner: "owner",
      repo: "repo",
      ref: Option.none(),
      subPath: Option.none(),
      name: "bitbucket",
      url: new URL("https://bitbucket.org"),
    } as const;

    const result = await Effect.runPromise(buildCloneUrl(source));

    expect(result).toBe("https://bitbucket.org/owner/repo.git");
  });

  it("builds Azure Repos clone URL from config url", async () => {
    const source = {
      type: "azurerepos",
      organization: "myorg",
      project: "myproject",
      repo: "myrepo",
      ref: Option.none(),
      subPath: Option.none(),
      name: "azurerepos",
      url: new URL("https://dev.azure.com"),
    } as const;

    const result = await Effect.runPromise(buildCloneUrl(source));

    expect(result).toBe("https://dev.azure.com/myorg/myproject/_git/myrepo");
  });
});

describe("getOrigin", () => {
  it("returns GitHub origin URL from config url", () => {
    const source = {
      type: "github",
      owner: "owner",
      repo: "repo",
      ref: Option.none(),
      subPath: Option.none(),
      name: "github",
      url: new URL("https://github.com"),
    } as const;

    const result = getOrigin(source);

    expect(result).toBe("https://github.com/owner/repo");
  });

  it("returns GitHub origin URL with custom url", () => {
    const source = {
      type: "github",
      owner: "owner",
      repo: "repo",
      ref: Option.none(),
      subPath: Option.none(),
      name: "my-ghe",
      url: new URL("https://github.example.com"),
    } as const;

    const result = getOrigin(source);

    expect(result).toBe("https://github.example.com/owner/repo");
  });

  it("returns GitLab origin URL from config url", () => {
    const source = {
      type: "gitlab",
      owner: "owner",
      repo: "repo",
      ref: Option.none(),
      subPath: Option.none(),
      name: "gitlab",
      url: new URL("https://gitlab.com"),
    } as const;

    const result = getOrigin(source);

    expect(result).toBe("https://gitlab.com/owner/repo");
  });

  it("returns Bitbucket origin URL from config url", () => {
    const source = {
      type: "bitbucket",
      owner: "owner",
      repo: "repo",
      ref: Option.none(),
      subPath: Option.none(),
      name: "bitbucket",
      url: new URL("https://bitbucket.org"),
    } as const;

    const result = getOrigin(source);

    expect(result).toBe("https://bitbucket.org/owner/repo");
  });

  it("returns Azure Repos origin URL from config url", () => {
    const source = {
      type: "azurerepos",
      organization: "myorg",
      project: "myproject",
      repo: "myrepo",
      ref: Option.none(),
      subPath: Option.none(),
      name: "azurerepos",
      url: new URL("https://dev.azure.com"),
    } as const;

    const result = getOrigin(source);

    expect(result).toBe("https://dev.azure.com/myorg/myproject/_git/myrepo");
  });
});
