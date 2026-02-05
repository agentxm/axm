/**
 * Unit tests for source-parser module.
 *
 * Tests parsing of various source formats into normalized ParsedSource structures.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { buildCloneUrl, getOriginFromParsed } from "./clone-url.js";
import { ParseError } from "./errors.js";
import { parseSource } from "./parser.js";
import { ParsedSource } from "./types.js";

describe("source-parser", () => {
  describe("GitHub shorthand", () => {
    it.effect("parses owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("owner/repo");

        expect(result.source).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        if (result.source === "github") {
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
          expect(Option.isNone(result.ref)).toBe(true);
          expect(Option.isNone(result.path)).toBe(true);
        }
      }),
    );

    it.effect("parses owner/repo@ref", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("owner/repo@v1.0.0");

        expect(result.source).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        if (result.source === "github") {
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
          expect(result.ref).toEqual(Option.some("v1.0.0"));
          expect(Option.isNone(result.path)).toBe(true);
        }
      }),
    );

    it.effect("parses owner/repo/path", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("owner/repo/skills/my-skill");

        expect(result.source).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        if (result.source === "github") {
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
          expect(Option.isNone(result.ref)).toBe(true);
          expect(result.path).toEqual(Option.some("skills/my-skill"));
        }
      }),
    );

    it.effect("parses owner/repo/path@ref", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("owner/repo/skills/my-skill@main");

        expect(result.source).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        if (result.source === "github") {
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
          expect(result.ref).toEqual(Option.some("main"));
          expect(result.path).toEqual(Option.some("skills/my-skill"));
        }
      }),
    );

    it.effect("parses owner/repo with branch ref", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("owner/repo@feature/branch");

        expect(result.source).toBe("github");
        if (result.source === "github") {
          expect(result.ref).toEqual(Option.some("feature/branch"));
        }
      }),
    );

    it.effect("parses owner/repo with commit SHA", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("owner/repo@abc123def456");

        expect(result.source).toBe("github");
        if (result.source === "github") {
          expect(result.ref).toEqual(Option.some("abc123def456"));
        }
      }),
    );
  });

  describe("prefixed shorthand", () => {
    it.effect("parses github:owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("github:owner/repo");

        expect(result.source).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        if (result.source === "github") {
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
        }
      }),
    );

    it.effect("parses gitlab:owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("gitlab:owner/repo");

        expect(result.source).toBe("gitlab");
        expect(result.canonical).toBe("gitlab:owner/repo");
        if (result.source === "gitlab") {
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
        }
      }),
    );

    it.effect("parses github:owner/repo/path@ref", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("github:owner/repo/skills/my-skill@v1.0.0");

        expect(result.source).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        if (result.source === "github") {
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
          expect(result.path).toEqual(Option.some("skills/my-skill"));
          expect(result.ref).toEqual(Option.some("v1.0.0"));
        }
      }),
    );

    it.effect("parses gitlab:owner/repo@ref", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("gitlab:owner/repo@main");

        expect(result.source).toBe("gitlab");
        expect(result.canonical).toBe("gitlab:owner/repo");
        if (result.source === "gitlab") {
          expect(result.ref).toEqual(Option.some("main"));
        }
      }),
    );
  });

  describe("GitHub HTTPS URLs", () => {
    it.effect("parses https://github.com/owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://github.com/owner/repo");

        expect(result.source).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        if (result.source === "github") {
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
        }
        expect(result.original).toBe("https://github.com/owner/repo");
      }),
    );

    it.effect("parses https://github.com/owner/repo.git", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://github.com/owner/repo.git");

        expect(result.source).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        if (result.source === "github") {
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
        }
      }),
    );

    it.effect("parses https://github.com/owner/repo/tree/branch", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://github.com/owner/repo/tree/main");

        expect(result.source).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        if (result.source === "github") {
          expect(result.ref).toEqual(Option.some("main"));
          expect(Option.isNone(result.path)).toBe(true);
        }
      }),
    );

    it.effect("parses https://github.com/owner/repo/tree/branch/path", () =>
      Effect.gen(function* () {
        const result = yield* parseSource(
          "https://github.com/owner/repo/tree/main/skills/my-skill",
        );

        expect(result.source).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        if (result.source === "github") {
          expect(result.ref).toEqual(Option.some("main"));
          expect(result.path).toEqual(Option.some("skills/my-skill"));
        }
      }),
    );

    it.effect("parses http://github.com/owner/repo (HTTP)", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("http://github.com/owner/repo");

        expect(result.source).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
      }),
    );
  });

  describe("GitLab HTTPS URLs", () => {
    it.effect("parses https://gitlab.com/owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://gitlab.com/owner/repo");

        expect(result.source).toBe("gitlab");
        expect(result.canonical).toBe("gitlab:owner/repo");
        if (result.source === "gitlab") {
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
        }
      }),
    );

    it.effect("parses https://gitlab.com/owner/repo.git", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://gitlab.com/owner/repo.git");

        expect(result.source).toBe("gitlab");
        expect(result.canonical).toBe("gitlab:owner/repo");
      }),
    );

    it.effect("parses https://gitlab.com/owner/repo/-/tree/branch", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://gitlab.com/owner/repo/-/tree/main");

        expect(result.source).toBe("gitlab");
        expect(result.canonical).toBe("gitlab:owner/repo");
        if (result.source === "gitlab") {
          expect(result.ref).toEqual(Option.some("main"));
        }
      }),
    );

    it.effect("parses https://gitlab.com/owner/repo/-/tree/branch/path", () =>
      Effect.gen(function* () {
        const result = yield* parseSource(
          "https://gitlab.com/owner/repo/-/tree/main/skills/my-skill",
        );

        expect(result.source).toBe("gitlab");
        expect(result.canonical).toBe("gitlab:owner/repo");
        if (result.source === "gitlab") {
          expect(result.ref).toEqual(Option.some("main"));
          expect(result.path).toEqual(Option.some("skills/my-skill"));
        }
      }),
    );
  });

  describe("GitHub SSH URLs", () => {
    it.effect("parses git@github.com:owner/repo.git", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("git@github.com:owner/repo.git");

        expect(result.source).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        if (result.source === "github") {
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
        }
      }),
    );

    it.effect("parses git@github.com:owner/repo (without .git)", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("git@github.com:owner/repo");

        expect(result.source).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
      }),
    );
  });

  describe("GitLab SSH URLs", () => {
    it.effect("parses git@gitlab.com:owner/repo.git", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("git@gitlab.com:owner/repo.git");

        expect(result.source).toBe("gitlab");
        expect(result.canonical).toBe("gitlab:owner/repo");
        if (result.source === "gitlab") {
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
        }
      }),
    );

    it.effect("parses git@gitlab.com:owner/repo (without .git)", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("git@gitlab.com:owner/repo");

        expect(result.source).toBe("gitlab");
        expect(result.canonical).toBe("gitlab:owner/repo");
      }),
    );
  });

  describe("Bitbucket HTTPS URLs", () => {
    it.effect("parses https://bitbucket.org/owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://bitbucket.org/owner/repo");

        expect(result.source).toBe("bitbucket");
        expect(result.canonical).toBe("bitbucket:owner/repo");
        if (result.source === "bitbucket") {
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
        }
      }),
    );

    it.effect("parses https://bitbucket.org/owner/repo.git", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://bitbucket.org/owner/repo.git");

        expect(result.source).toBe("bitbucket");
        expect(result.canonical).toBe("bitbucket:owner/repo");
        if (result.source === "bitbucket") {
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
        }
      }),
    );

    it.effect("parses https://bitbucket.org/owner/repo/src/main", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://bitbucket.org/owner/repo/src/main");

        expect(result.source).toBe("bitbucket");
        expect(result.canonical).toBe("bitbucket:owner/repo");
        if (result.source === "bitbucket") {
          expect(result.ref).toEqual(Option.some("main"));
          expect(Option.isNone(result.path)).toBe(true);
        }
      }),
    );

    it.effect("parses https://bitbucket.org/owner/repo/src/main/skills/my-skill", () =>
      Effect.gen(function* () {
        const result = yield* parseSource(
          "https://bitbucket.org/owner/repo/src/main/skills/my-skill",
        );

        expect(result.source).toBe("bitbucket");
        expect(result.canonical).toBe("bitbucket:owner/repo");
        if (result.source === "bitbucket") {
          expect(result.ref).toEqual(Option.some("main"));
          expect(result.path).toEqual(Option.some("skills/my-skill"));
        }
      }),
    );
  });

  describe("Bitbucket SSH URLs", () => {
    it.effect("parses git@bitbucket.org:owner/repo.git", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("git@bitbucket.org:owner/repo.git");

        expect(result.source).toBe("bitbucket");
        expect(result.canonical).toBe("bitbucket:owner/repo");
        if (result.source === "bitbucket") {
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
        }
      }),
    );

    it.effect("parses git@bitbucket.org:owner/repo (without .git)", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("git@bitbucket.org:owner/repo");

        expect(result.source).toBe("bitbucket");
        expect(result.canonical).toBe("bitbucket:owner/repo");
      }),
    );
  });

  describe("Bitbucket shorthand", () => {
    it.effect("parses bitbucket:owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("bitbucket:owner/repo");

        expect(result.source).toBe("bitbucket");
        expect(result.canonical).toBe("bitbucket:owner/repo");
        if (result.source === "bitbucket") {
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
        }
      }),
    );

    it.effect("parses bitbucket:owner/repo@ref", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("bitbucket:owner/repo@v1.0.0");

        expect(result.source).toBe("bitbucket");
        expect(result.canonical).toBe("bitbucket:owner/repo");
        if (result.source === "bitbucket") {
          expect(result.ref).toEqual(Option.some("v1.0.0"));
        }
      }),
    );

    it.effect("parses bitbucket:owner/repo/path@ref", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("bitbucket:owner/repo/skills/my-skill@main");

        expect(result.source).toBe("bitbucket");
        expect(result.canonical).toBe("bitbucket:owner/repo");
        if (result.source === "bitbucket") {
          expect(result.path).toEqual(Option.some("skills/my-skill"));
          expect(result.ref).toEqual(Option.some("main"));
        }
      }),
    );
  });

  describe("local path parsing", () => {
    it.effect("parses relative path starting with ./", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("./my-skill");
        expect(result.source).toBe("local");
        expect(result.original).toBe("./my-skill");
        expect(result.canonical).toBe("local:./my-skill");
      }),
    );

    it.effect("parses relative path starting with ../", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("../sibling-skill");
        expect(result.source).toBe("local");
        expect(result.canonical).toBe("local:../sibling-skill");
      }),
    );

    it.effect("parses absolute POSIX path", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("/home/user/skills/my-skill");
        expect(result.source).toBe("local");
        expect(result.canonical).toBe("local:/home/user/skills/my-skill");
      }),
    );

    it.effect("parses home directory path with ~/", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("~/my-skills/dev-skill");
        expect(result.source).toBe("local");
        expect(result.canonical).toBe("local:~/my-skills/dev-skill");
      }),
    );

    it.effect("parses home directory path with ~\\ (Windows)", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("~\\my-skills\\dev-skill");
        expect(result.source).toBe("local");
        expect(result.canonical).toBe("local:~\\my-skills\\dev-skill");
      }),
    );

    it.effect("parses Windows path with drive letter and backslash", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("C:\\Users\\name\\skills");
        expect(result.source).toBe("local");
        expect(result.canonical).toBe("local:C:\\Users\\name\\skills");
      }),
    );

    it.effect("parses Windows path with drive letter and forward slash", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("C:/Users/name/skills");
        expect(result.source).toBe("local");
        expect(result.canonical).toBe("local:C:/Users/name/skills");
      }),
    );

    it.effect("parses explicit local: prefix", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("local:./my-skill");
        expect(result.source).toBe("local");
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

        expect(result.source).toBe("github");
        if (result.source === "github") {
          expect(result.repo).toBe("repo.js");
        }
      }),
    );

    it.effect("handles repo names with dashes", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("owner/my-awesome-repo");

        expect(result.source).toBe("github");
        if (result.source === "github") {
          expect(result.repo).toBe("my-awesome-repo");
        }
      }),
    );

    it.effect("handles owner names with dashes", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("my-org/repo");

        expect(result.source).toBe("github");
        if (result.source === "github") {
          expect(result.owner).toBe("my-org");
        }
      }),
    );

    it.effect("parses ./ starting path as local", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("./owner/repo");
        expect(result.source).toBe("local");
        expect(result.canonical).toBe("local:./owner/repo");
      }),
    );

    it.effect("parses ../ starting path as local", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("../owner/repo");
        expect(result.source).toBe("local");
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
