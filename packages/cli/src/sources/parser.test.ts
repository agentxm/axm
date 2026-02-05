/**
 * Unit tests for source-parser module.
 *
 * Tests parsing of various source formats into normalized ParsedSource structures.
 */

import { describe, expect, it } from "@effect/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { buildCloneUrl, getOriginFromParsed } from "./clone-url.js";
import { ParseError } from "./errors.js";
import { type InputPattern, parseInputPattern, parseSource, parseSourceV2 } from "./parser.js";
import { ParsedSource } from "./types.js";

describe("source-parser", () => {
  describe("GitHub shorthand", () => {
    it.effect("parses owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("owner/repo");

        expect(result.source.source).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        if (result.source.source === "github") {
          expect(result.source.owner).toBe("owner");
          expect(result.source.repo).toBe("repo");
          expect(Option.isNone(result.source.ref)).toBe(true);
          expect(Option.isNone(result.source.subPath)).toBe(true);
        }
      }),
    );

    it.effect("parses owner/repo@ref", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("owner/repo@v1.0.0");

        expect(result.source.source).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        if (result.source.source === "github") {
          expect(result.source.owner).toBe("owner");
          expect(result.source.repo).toBe("repo");
          expect(result.source.ref).toEqual(Option.some("v1.0.0"));
          expect(Option.isNone(result.source.subPath)).toBe(true);
        }
      }),
    );

    it.effect("parses owner/repo/path", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("owner/repo/skills/my-skill");

        expect(result.source.source).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        if (result.source.source === "github") {
          expect(result.source.owner).toBe("owner");
          expect(result.source.repo).toBe("repo");
          expect(Option.isNone(result.source.ref)).toBe(true);
          expect(result.source.subPath).toEqual(Option.some("skills/my-skill"));
        }
      }),
    );

    it.effect("parses owner/repo/path@ref", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("owner/repo/skills/my-skill@main");

        expect(result.source.source).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        if (result.source.source === "github") {
          expect(result.source.owner).toBe("owner");
          expect(result.source.repo).toBe("repo");
          expect(result.source.ref).toEqual(Option.some("main"));
          expect(result.source.subPath).toEqual(Option.some("skills/my-skill"));
        }
      }),
    );

    it.effect("parses owner/repo with branch ref", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("owner/repo@feature/branch");

        expect(result.source.source).toBe("github");
        if (result.source.source === "github") {
          expect(result.source.ref).toEqual(Option.some("feature/branch"));
        }
      }),
    );

    it.effect("parses owner/repo with commit SHA", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("owner/repo@abc123def456");

        expect(result.source.source).toBe("github");
        if (result.source.source === "github") {
          expect(result.source.ref).toEqual(Option.some("abc123def456"));
        }
      }),
    );
  });

  describe("prefixed shorthand", () => {
    it.effect("parses github:owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("github:owner/repo");

        expect(result.source.source).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        if (result.source.source === "github") {
          expect(result.source.owner).toBe("owner");
          expect(result.source.repo).toBe("repo");
        }
      }),
    );

    it.effect("parses gitlab:owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("gitlab:owner/repo");

        expect(result.source.source).toBe("gitlab");
        expect(result.canonical).toBe("gitlab:owner/repo");
        if (result.source.source === "gitlab") {
          expect(result.source.owner).toBe("owner");
          expect(result.source.repo).toBe("repo");
        }
      }),
    );

    it.effect("parses github:owner/repo/path@ref", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("github:owner/repo/skills/my-skill@v1.0.0");

        expect(result.source.source).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        if (result.source.source === "github") {
          expect(result.source.owner).toBe("owner");
          expect(result.source.repo).toBe("repo");
          expect(result.source.subPath).toEqual(Option.some("skills/my-skill"));
          expect(result.source.ref).toEqual(Option.some("v1.0.0"));
        }
      }),
    );

    it.effect("parses gitlab:owner/repo@ref", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("gitlab:owner/repo@main");

        expect(result.source.source).toBe("gitlab");
        expect(result.canonical).toBe("gitlab:owner/repo");
        if (result.source.source === "gitlab") {
          expect(result.source.ref).toEqual(Option.some("main"));
        }
      }),
    );
  });

  describe("GitHub HTTPS URLs", () => {
    it.effect("parses https://github.com/owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://github.com/owner/repo");

        expect(result.source.source).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        if (result.source.source === "github") {
          expect(result.source.owner).toBe("owner");
          expect(result.source.repo).toBe("repo");
        }
        expect(result.original).toBe("https://github.com/owner/repo");
      }),
    );

    it.effect("parses https://github.com/owner/repo.git", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://github.com/owner/repo.git");

        expect(result.source.source).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        if (result.source.source === "github") {
          expect(result.source.owner).toBe("owner");
          expect(result.source.repo).toBe("repo");
        }
      }),
    );

    it.effect("parses https://github.com/owner/repo/tree/branch", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://github.com/owner/repo/tree/main");

        expect(result.source.source).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        if (result.source.source === "github") {
          expect(result.source.ref).toEqual(Option.some("main"));
          expect(Option.isNone(result.source.subPath)).toBe(true);
        }
      }),
    );

    it.effect("parses https://github.com/owner/repo/tree/branch/path", () =>
      Effect.gen(function* () {
        const result = yield* parseSource(
          "https://github.com/owner/repo/tree/main/skills/my-skill",
        );

        expect(result.source.source).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        if (result.source.source === "github") {
          expect(result.source.ref).toEqual(Option.some("main"));
          expect(result.source.subPath).toEqual(Option.some("skills/my-skill"));
        }
      }),
    );

    it.effect("parses http://github.com/owner/repo (HTTP)", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("http://github.com/owner/repo");

        expect(result.source.source).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
      }),
    );
  });

  describe("GitLab HTTPS URLs", () => {
    it.effect("parses https://gitlab.com/owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://gitlab.com/owner/repo");

        expect(result.source.source).toBe("gitlab");
        expect(result.canonical).toBe("gitlab:owner/repo");
        if (result.source.source === "gitlab") {
          expect(result.source.owner).toBe("owner");
          expect(result.source.repo).toBe("repo");
        }
      }),
    );

    it.effect("parses https://gitlab.com/owner/repo.git", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://gitlab.com/owner/repo.git");

        expect(result.source.source).toBe("gitlab");
        expect(result.canonical).toBe("gitlab:owner/repo");
      }),
    );

    it.effect("parses https://gitlab.com/owner/repo/-/tree/branch", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://gitlab.com/owner/repo/-/tree/main");

        expect(result.source.source).toBe("gitlab");
        expect(result.canonical).toBe("gitlab:owner/repo");
        if (result.source.source === "gitlab") {
          expect(result.source.ref).toEqual(Option.some("main"));
        }
      }),
    );

    it.effect("parses https://gitlab.com/owner/repo/-/tree/branch/path", () =>
      Effect.gen(function* () {
        const result = yield* parseSource(
          "https://gitlab.com/owner/repo/-/tree/main/skills/my-skill",
        );

        expect(result.source.source).toBe("gitlab");
        expect(result.canonical).toBe("gitlab:owner/repo");
        if (result.source.source === "gitlab") {
          expect(result.source.ref).toEqual(Option.some("main"));
          expect(result.source.subPath).toEqual(Option.some("skills/my-skill"));
        }
      }),
    );
  });

  describe("GitHub SSH URLs", () => {
    it.effect("parses git@github.com:owner/repo.git", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("git@github.com:owner/repo.git");

        expect(result.source.source).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        if (result.source.source === "github") {
          expect(result.source.owner).toBe("owner");
          expect(result.source.repo).toBe("repo");
        }
      }),
    );

    it.effect("parses git@github.com:owner/repo (without .git)", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("git@github.com:owner/repo");

        expect(result.source.source).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
      }),
    );
  });

  describe("GitLab SSH URLs", () => {
    it.effect("parses git@gitlab.com:owner/repo.git", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("git@gitlab.com:owner/repo.git");

        expect(result.source.source).toBe("gitlab");
        expect(result.canonical).toBe("gitlab:owner/repo");
        if (result.source.source === "gitlab") {
          expect(result.source.owner).toBe("owner");
          expect(result.source.repo).toBe("repo");
        }
      }),
    );

    it.effect("parses git@gitlab.com:owner/repo (without .git)", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("git@gitlab.com:owner/repo");

        expect(result.source.source).toBe("gitlab");
        expect(result.canonical).toBe("gitlab:owner/repo");
      }),
    );
  });

  describe("Bitbucket HTTPS URLs", () => {
    it.effect("parses https://bitbucket.org/owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://bitbucket.org/owner/repo");

        expect(result.source.source).toBe("bitbucket");
        expect(result.canonical).toBe("bitbucket:owner/repo");
        if (result.source.source === "bitbucket") {
          expect(result.source.owner).toBe("owner");
          expect(result.source.repo).toBe("repo");
        }
      }),
    );

    it.effect("parses https://bitbucket.org/owner/repo.git", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://bitbucket.org/owner/repo.git");

        expect(result.source.source).toBe("bitbucket");
        expect(result.canonical).toBe("bitbucket:owner/repo");
        if (result.source.source === "bitbucket") {
          expect(result.source.owner).toBe("owner");
          expect(result.source.repo).toBe("repo");
        }
      }),
    );

    it.effect("parses https://bitbucket.org/owner/repo/src/main", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://bitbucket.org/owner/repo/src/main");

        expect(result.source.source).toBe("bitbucket");
        expect(result.canonical).toBe("bitbucket:owner/repo");
        if (result.source.source === "bitbucket") {
          expect(result.source.ref).toEqual(Option.some("main"));
          expect(Option.isNone(result.source.subPath)).toBe(true);
        }
      }),
    );

    it.effect("parses https://bitbucket.org/owner/repo/src/main/skills/my-skill", () =>
      Effect.gen(function* () {
        const result = yield* parseSource(
          "https://bitbucket.org/owner/repo/src/main/skills/my-skill",
        );

        expect(result.source.source).toBe("bitbucket");
        expect(result.canonical).toBe("bitbucket:owner/repo");
        if (result.source.source === "bitbucket") {
          expect(result.source.ref).toEqual(Option.some("main"));
          expect(result.source.subPath).toEqual(Option.some("skills/my-skill"));
        }
      }),
    );
  });

  describe("Bitbucket SSH URLs", () => {
    it.effect("parses git@bitbucket.org:owner/repo.git", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("git@bitbucket.org:owner/repo.git");

        expect(result.source.source).toBe("bitbucket");
        expect(result.canonical).toBe("bitbucket:owner/repo");
        if (result.source.source === "bitbucket") {
          expect(result.source.owner).toBe("owner");
          expect(result.source.repo).toBe("repo");
        }
      }),
    );

    it.effect("parses git@bitbucket.org:owner/repo (without .git)", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("git@bitbucket.org:owner/repo");

        expect(result.source.source).toBe("bitbucket");
        expect(result.canonical).toBe("bitbucket:owner/repo");
      }),
    );
  });

  describe("Bitbucket shorthand", () => {
    it.effect("parses bitbucket:owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("bitbucket:owner/repo");

        expect(result.source.source).toBe("bitbucket");
        expect(result.canonical).toBe("bitbucket:owner/repo");
        if (result.source.source === "bitbucket") {
          expect(result.source.owner).toBe("owner");
          expect(result.source.repo).toBe("repo");
        }
      }),
    );

    it.effect("parses bitbucket:owner/repo@ref", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("bitbucket:owner/repo@v1.0.0");

        expect(result.source.source).toBe("bitbucket");
        expect(result.canonical).toBe("bitbucket:owner/repo");
        if (result.source.source === "bitbucket") {
          expect(result.source.ref).toEqual(Option.some("v1.0.0"));
        }
      }),
    );

    it.effect("parses bitbucket:owner/repo/path@ref", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("bitbucket:owner/repo/skills/my-skill@main");

        expect(result.source.source).toBe("bitbucket");
        expect(result.canonical).toBe("bitbucket:owner/repo");
        if (result.source.source === "bitbucket") {
          expect(result.source.subPath).toEqual(Option.some("skills/my-skill"));
          expect(result.source.ref).toEqual(Option.some("main"));
        }
      }),
    );
  });

  describe("local path parsing", () => {
    it.effect("parses relative path starting with ./", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("./my-skill");
        expect(result.source.source).toBe("local");
        expect(result.original).toBe("./my-skill");
        expect(result.canonical).toBe("local:./my-skill");
      }),
    );

    it.effect("parses relative path starting with ../", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("../sibling-skill");
        expect(result.source.source).toBe("local");
        expect(result.canonical).toBe("local:../sibling-skill");
      }),
    );

    it.effect("parses absolute POSIX path", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("/home/user/skills/my-skill");
        expect(result.source.source).toBe("local");
        expect(result.canonical).toBe("local:/home/user/skills/my-skill");
      }),
    );

    it.effect("parses home directory path with ~/", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("~/my-skills/dev-skill");
        expect(result.source.source).toBe("local");
        expect(result.canonical).toBe("local:~/my-skills/dev-skill");
      }),
    );

    it.effect("parses home directory path with ~\\ (Windows)", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("~\\my-skills\\dev-skill");
        expect(result.source.source).toBe("local");
        expect(result.canonical).toBe("local:~\\my-skills\\dev-skill");
      }),
    );

    it.effect("parses Windows path with drive letter and backslash", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("C:\\Users\\name\\skills");
        expect(result.source.source).toBe("local");
        expect(result.canonical).toBe("local:C:\\Users\\name\\skills");
      }),
    );

    it.effect("parses Windows path with drive letter and forward slash", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("C:/Users/name/skills");
        expect(result.source.source).toBe("local");
        expect(result.canonical).toBe("local:C:/Users/name/skills");
      }),
    );

    it.effect("parses explicit local: prefix", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("local:./my-skill");
        expect(result.source.source).toBe("local");
        expect(result.canonical).toBe("local:./my-skill");
      }),
    );
  });

  describe("unsupported URLs", () => {
    it.effect("fails on unknown HTTPS URLs", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSource("https://example.com"));

        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toContain("Unable to parse source");
      }),
    );
  });

  describe("error handling", () => {
    it.effect("fails on empty string", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSource(""));

        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toBe("Source string cannot be empty");
      }),
    );

    it.effect("fails on whitespace-only string", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSource("   "));

        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toBe("Source string cannot be empty");
      }),
    );

    it.effect("fails on invalid source format", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSource("not-a-valid-source"));

        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toContain("Unable to parse source");
      }),
    );

    it.effect("includes input in error", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSource("invalid"));

        expect(error.input).toBe("invalid");
      }),
    );
  });

  describe("edge cases", () => {
    it.effect("trims whitespace from input", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("  owner/repo  ");

        expect(result.canonical).toBe("github:owner/repo");
      }),
    );

    it.effect("handles repo names with dots", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("owner/repo.js");

        expect(result.source.source).toBe("github");
        if (result.source.source === "github") {
          expect(result.source.repo).toBe("repo.js");
        }
      }),
    );

    it.effect("handles repo names with dashes", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("owner/my-awesome-repo");

        expect(result.source.source).toBe("github");
        if (result.source.source === "github") {
          expect(result.source.repo).toBe("my-awesome-repo");
        }
      }),
    );

    it.effect("handles owner names with dashes", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("my-org/repo");

        expect(result.source.source).toBe("github");
        if (result.source.source === "github") {
          expect(result.source.owner).toBe("my-org");
        }
      }),
    );

    it.effect("parses ./ starting path as local", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("./owner/repo");
        expect(result.source.source).toBe("local");
        expect(result.canonical).toBe("local:./owner/repo");
      }),
    );

    it.effect("parses ../ starting path as local", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("../owner/repo");
        expect(result.source.source).toBe("local");
        expect(result.canonical).toBe("local:../owner/repo");
      }),
    );

    it.effect("preserves original input in result", () =>
      Effect.gen(function* () {
        const input = "https://github.com/owner/repo/tree/main/path";
        const result = yield* parseSource(input);

        expect(result.original).toBe(input);
      }),
    );
  });

  describe("buildCloneUrl", () => {
    it("builds GitHub clone URL", async () => {
      const parsed = ParsedSource.GitHub({
        original: "owner/repo",
        owner: "owner",
        repo: "repo",
      });

      const result = await Effect.runPromise(buildCloneUrl(parsed));

      expect(result).toBe("https://github.com/owner/repo.git");
    });

    it("builds GitLab clone URL", async () => {
      const parsed = ParsedSource.GitLab({
        original: "gitlab:owner/repo",
        owner: "owner",
        repo: "repo",
      });

      const result = await Effect.runPromise(buildCloneUrl(parsed));

      expect(result).toBe("https://gitlab.com/owner/repo.git");
    });

    it("builds Bitbucket clone URL", async () => {
      const parsed = ParsedSource.Bitbucket({
        original: "bitbucket:owner/repo",
        owner: "owner",
        repo: "repo",
      });

      const result = await Effect.runPromise(buildCloneUrl(parsed));

      expect(result).toBe("https://bitbucket.org/owner/repo.git");
    });
  });

  describe("getOriginFromParsed", () => {
    it("returns GitHub origin URL", () => {
      const parsed = ParsedSource.GitHub({
        original: "owner/repo",
        owner: "owner",
        repo: "repo",
      });

      const result = getOriginFromParsed(parsed);

      expect(result).toBe("https://github.com/owner/repo");
    });

    it("returns GitLab origin URL", () => {
      const parsed = ParsedSource.GitLab({
        original: "gitlab:owner/repo",
        owner: "owner",
        repo: "repo",
      });

      const result = getOriginFromParsed(parsed);

      expect(result).toBe("https://gitlab.com/owner/repo");
    });

    it("returns Bitbucket origin URL", () => {
      const parsed = ParsedSource.Bitbucket({
        original: "bitbucket:owner/repo",
        owner: "owner",
        repo: "repo",
      });

      const result = getOriginFromParsed(parsed);

      expect(result).toBe("https://bitbucket.org/owner/repo");
    });
  });
});

describe("parseSourceV2", () => {
  describe("parseInputPattern", () => {
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

    it("classifies @scope/name as RegistrySourceInput", () => {
      expectSome("@myorg/some-name", {
        _tag: "RegistrySourceInput",
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

    it("classifies git@ SCP-style address as ScpAddress", () => {
      expectSome("git@github.com:owner/repo", {
        _tag: "ScpAddress",
        input: "git@github.com:owner/repo",
      });
    });

    it("classifies owner/repo as SlashPattern", () => {
      expectSome("owner/repo", { _tag: "SlashPattern", input: "owner/repo" });
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

    it("returns None for empty string", () => {
      expectNone("");
    });

    it("returns None for whitespace-only string", () => {
      expectNone("   ");
    });
  });

  describe("stub errors", () => {
    it.effect("fails on empty input", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSourceV2(""));
        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toBe("Unable to parse source");
      }),
    );

    it.effect("fails on whitespace-only input", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSourceV2("   "));
        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toBe("Unable to parse source");
      }),
    );

    it.effect("fails with 'not yet supported' for NameInput", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSourceV2("some-name"));
        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toBe("Name input is not yet supported");
      }),
    );

    it.effect("fails with 'not yet supported' for RegistrySourceInput", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSourceV2("@myorg/some-name"));
        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toBe("Registry source input is not yet supported");
      }),
    );

    it.effect("parses GitHub HTTPS URL via UrlInput", () =>
      Effect.gen(function* () {
        const result = yield* parseSourceV2("https://github.com/owner/repo");
        expect(result.source).toMatchObject({ source: "github", owner: "owner", repo: "repo" });
      }),
    );

    it.effect("parses GitLab HTTPS URL via UrlInput", () =>
      Effect.gen(function* () {
        const result = yield* parseSourceV2("https://gitlab.com/owner/repo");
        expect(result.source).toMatchObject({ source: "gitlab", owner: "owner", repo: "repo" });
      }),
    );

    it.effect("parses Bitbucket HTTPS URL via UrlInput", () =>
      Effect.gen(function* () {
        const result = yield* parseSourceV2("https://bitbucket.org/owner/repo");
        expect(result.source).toMatchObject({
          source: "bitbucket",
          owner: "owner",
          repo: "repo",
        });
      }),
    );

    it.effect("fails with 'not yet supported' for ScpAddress", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSourceV2("git@github.com:owner/repo.git"));
        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toBe("SCP-style git addresses are not yet supported");
      }),
    );

    it.effect("fails for unsupported URL host", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSourceV2("https://example.com/owner/repo"));
        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toContain("Unsupported URL host");
      }),
    );

    it.effect("rejects invalid URL with unrecognized segments", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSourceV2("http://"));
        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toBe("Unable to parse source");
      }),
    );

    describe("SlashPattern resolution", () => {
      let originalFetch: typeof globalThis.fetch;

      beforeEach(() => {
        originalFetch = globalThis.fetch;
      });

      afterEach(() => {
        globalThis.fetch = originalFetch;
        vi.restoreAllMocks();
      });

      const mockFetch = (responses: Record<string, { ok: boolean } | "error">): void => {
        globalThis.fetch = vi.fn((url: string | URL | Request) => {
          const urlStr = typeof url === "string" ? url : url.toString();
          const response = responses[urlStr];
          if (response === "error") return Promise.reject(new Error("Network error"));
          if (response)
            return Promise.resolve(new Response(null, { status: response.ok ? 200 : 404 }));
          return Promise.resolve(new Response(null, { status: 404 }));
        }) as unknown as typeof globalThis.fetch;
      };

      it.effect("resolves to GitHub when GitHub returns 200", () =>
        Effect.gen(function* () {
          mockFetch({ "https://github.com/owner/repo": { ok: true } });
          const result = yield* parseSourceV2("owner/repo");
          expect(result.source.source).toBe("github");
          expect(result.source).toMatchObject({ owner: "owner", repo: "repo" });
          expect(result.original).toBe("owner/repo");
          expect(result.canonical).toBe("github:owner/repo");
        }),
      );

      it.effect("resolves to GitLab when GitHub 404, GitLab 200", () =>
        Effect.gen(function* () {
          mockFetch({
            "https://github.com/owner/repo": { ok: false },
            "https://gitlab.com/owner/repo": { ok: true },
          });
          const result = yield* parseSourceV2("owner/repo");
          expect(result.source.source).toBe("gitlab");
          expect(result.source).toMatchObject({ owner: "owner", repo: "repo" });
          expect(result.canonical).toBe("gitlab:owner/repo");
        }),
      );

      it.effect("resolves to Bitbucket when GitHub 404, GitLab 404, Bitbucket 200", () =>
        Effect.gen(function* () {
          mockFetch({
            "https://github.com/owner/repo": { ok: false },
            "https://gitlab.com/owner/repo": { ok: false },
            "https://bitbucket.org/owner/repo": { ok: true },
          });
          const result = yield* parseSourceV2("owner/repo");
          expect(result.source.source).toBe("bitbucket");
          expect(result.source).toMatchObject({ owner: "owner", repo: "repo" });
          expect(result.canonical).toBe("bitbucket:owner/repo");
        }),
      );

      it.effect("fails when all providers return 404", () =>
        Effect.gen(function* () {
          mockFetch({
            "https://github.com/owner/repo": { ok: false },
            "https://gitlab.com/owner/repo": { ok: false },
            "https://bitbucket.org/owner/repo": { ok: false },
          });
          const error = yield* Effect.flip(parseSourceV2("owner/repo"));
          expect(error).toBeInstanceOf(ParseError);
          expect(error.message).toBe(
            "Repository 'owner/repo' not found on GitHub, GitLab, or Bitbucket",
          );
        }),
      );

      it.effect("falls through to GitLab on GitHub network error", () =>
        Effect.gen(function* () {
          mockFetch({
            "https://github.com/owner/repo": "error",
            "https://gitlab.com/owner/repo": { ok: true },
          });
          const result = yield* parseSourceV2("owner/repo");
          expect(result.source.source).toBe("gitlab");
        }),
      );

      it.effect("preserves original and canonical fields", () =>
        Effect.gen(function* () {
          mockFetch({ "https://github.com/my-org/my-repo": { ok: true } });
          const result = yield* parseSourceV2("my-org/my-repo");
          expect(result.original).toBe("my-org/my-repo");
          expect(result.canonical).toBe("github:my-org/my-repo");
        }),
      );
    });

    it.effect("fails with 'not yet supported' for FilePathPattern", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSourceV2("./local/path"));
        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toBe("File path pattern is not yet supported");
      }),
    );
  });
});
