/**
 * Unit tests for source-parser module.
 *
 * Tests parsing of various source formats into normalized ParsedSource structures.
 */

import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { buildCloneUrl, getOriginFromParsed, ParseError, parseSource } from "./source-parser.js";
import type { ParsedSource } from "./types.js";

describe("source-parser", () => {
  describe("GitHub shorthand", () => {
    it.effect("parses owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("owner/repo");

        expect(result.type).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        expect(result.owner).toBe("owner");
        expect(result.repo).toBe("repo");
        expect(result.ref).toBeUndefined();
        expect(result.path).toBeUndefined();
      }),
    );

    it.effect("parses owner/repo@ref", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("owner/repo@v1.0.0");

        expect(result.type).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        expect(result.owner).toBe("owner");
        expect(result.repo).toBe("repo");
        expect(result.ref).toBe("v1.0.0");
        expect(result.path).toBeUndefined();
      }),
    );

    it.effect("parses owner/repo/path", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("owner/repo/skills/my-skill");

        expect(result.type).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        expect(result.owner).toBe("owner");
        expect(result.repo).toBe("repo");
        expect(result.ref).toBeUndefined();
        expect(result.path).toBe("skills/my-skill");
      }),
    );

    it.effect("parses owner/repo/path@ref", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("owner/repo/skills/my-skill@main");

        expect(result.type).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        expect(result.owner).toBe("owner");
        expect(result.repo).toBe("repo");
        expect(result.ref).toBe("main");
        expect(result.path).toBe("skills/my-skill");
      }),
    );

    it.effect("parses owner/repo with branch ref", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("owner/repo@feature/branch");

        expect(result.type).toBe("github");
        expect(result.ref).toBe("feature/branch");
      }),
    );

    it.effect("parses owner/repo with commit SHA", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("owner/repo@abc123def456");

        expect(result.type).toBe("github");
        expect(result.ref).toBe("abc123def456");
      }),
    );
  });

  describe("prefixed shorthand", () => {
    it.effect("parses github:owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("github:owner/repo");

        expect(result.type).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        expect(result.owner).toBe("owner");
        expect(result.repo).toBe("repo");
      }),
    );

    it.effect("parses gitlab:owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("gitlab:owner/repo");

        expect(result.type).toBe("gitlab");
        expect(result.canonical).toBe("gitlab:owner/repo");
        expect(result.owner).toBe("owner");
        expect(result.repo).toBe("repo");
      }),
    );

    it.effect("parses github:owner/repo/path@ref", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("github:owner/repo/skills/my-skill@v1.0.0");

        expect(result.type).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        expect(result.owner).toBe("owner");
        expect(result.repo).toBe("repo");
        expect(result.path).toBe("skills/my-skill");
        expect(result.ref).toBe("v1.0.0");
      }),
    );

    it.effect("parses gitlab:owner/repo@ref", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("gitlab:owner/repo@main");

        expect(result.type).toBe("gitlab");
        expect(result.canonical).toBe("gitlab:owner/repo");
        expect(result.ref).toBe("main");
      }),
    );
  });

  describe("GitHub HTTPS URLs", () => {
    it.effect("parses https://github.com/owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://github.com/owner/repo");

        expect(result.type).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        expect(result.owner).toBe("owner");
        expect(result.repo).toBe("repo");
        expect(result.original).toBe("https://github.com/owner/repo");
      }),
    );

    it.effect("parses https://github.com/owner/repo.git", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://github.com/owner/repo.git");

        expect(result.type).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        expect(result.owner).toBe("owner");
        expect(result.repo).toBe("repo");
      }),
    );

    it.effect("parses https://github.com/owner/repo/tree/branch", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://github.com/owner/repo/tree/main");

        expect(result.type).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        expect(result.ref).toBe("main");
        expect(result.path).toBeUndefined();
      }),
    );

    it.effect("parses https://github.com/owner/repo/tree/branch/path", () =>
      Effect.gen(function* () {
        const result = yield* parseSource(
          "https://github.com/owner/repo/tree/main/skills/my-skill",
        );

        expect(result.type).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        expect(result.ref).toBe("main");
        expect(result.path).toBe("skills/my-skill");
      }),
    );

    it.effect("parses http://github.com/owner/repo (HTTP)", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("http://github.com/owner/repo");

        expect(result.type).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
      }),
    );
  });

  describe("GitLab HTTPS URLs", () => {
    it.effect("parses https://gitlab.com/owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://gitlab.com/owner/repo");

        expect(result.type).toBe("gitlab");
        expect(result.canonical).toBe("gitlab:owner/repo");
        expect(result.owner).toBe("owner");
        expect(result.repo).toBe("repo");
      }),
    );

    it.effect("parses https://gitlab.com/owner/repo.git", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://gitlab.com/owner/repo.git");

        expect(result.type).toBe("gitlab");
        expect(result.canonical).toBe("gitlab:owner/repo");
      }),
    );

    it.effect("parses https://gitlab.com/owner/repo/-/tree/branch", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://gitlab.com/owner/repo/-/tree/main");

        expect(result.type).toBe("gitlab");
        expect(result.canonical).toBe("gitlab:owner/repo");
        expect(result.ref).toBe("main");
      }),
    );

    it.effect("parses https://gitlab.com/owner/repo/-/tree/branch/path", () =>
      Effect.gen(function* () {
        const result = yield* parseSource(
          "https://gitlab.com/owner/repo/-/tree/main/skills/my-skill",
        );

        expect(result.type).toBe("gitlab");
        expect(result.canonical).toBe("gitlab:owner/repo");
        expect(result.ref).toBe("main");
        expect(result.path).toBe("skills/my-skill");
      }),
    );
  });

  describe("GitHub SSH URLs", () => {
    it.effect("parses git@github.com:owner/repo.git", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("git@github.com:owner/repo.git");

        expect(result.type).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
        expect(result.owner).toBe("owner");
        expect(result.repo).toBe("repo");
      }),
    );

    it.effect("parses git@github.com:owner/repo (without .git)", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("git@github.com:owner/repo");

        expect(result.type).toBe("github");
        expect(result.canonical).toBe("github:owner/repo");
      }),
    );
  });

  describe("GitLab SSH URLs", () => {
    it.effect("parses git@gitlab.com:owner/repo.git", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("git@gitlab.com:owner/repo.git");

        expect(result.type).toBe("gitlab");
        expect(result.canonical).toBe("gitlab:owner/repo");
        expect(result.owner).toBe("owner");
        expect(result.repo).toBe("repo");
      }),
    );

    it.effect("parses git@gitlab.com:owner/repo (without .git)", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("git@gitlab.com:owner/repo");

        expect(result.type).toBe("gitlab");
        expect(result.canonical).toBe("gitlab:owner/repo");
      }),
    );
  });

  describe("Bitbucket HTTPS URLs", () => {
    it.effect("parses https://bitbucket.org/owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://bitbucket.org/owner/repo");

        expect(result.type).toBe("bitbucket");
        expect(result.canonical).toBe("bitbucket:owner/repo");
        expect(result.owner).toBe("owner");
        expect(result.repo).toBe("repo");
      }),
    );

    it.effect("parses https://bitbucket.org/owner/repo.git", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://bitbucket.org/owner/repo.git");

        expect(result.type).toBe("bitbucket");
        expect(result.canonical).toBe("bitbucket:owner/repo");
        expect(result.owner).toBe("owner");
        expect(result.repo).toBe("repo");
      }),
    );

    it.effect("parses https://bitbucket.org/owner/repo/src/main", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://bitbucket.org/owner/repo/src/main");

        expect(result.type).toBe("bitbucket");
        expect(result.canonical).toBe("bitbucket:owner/repo");
        expect(result.ref).toBe("main");
        expect(result.path).toBeUndefined();
      }),
    );

    it.effect("parses https://bitbucket.org/owner/repo/src/main/skills/my-skill", () =>
      Effect.gen(function* () {
        const result = yield* parseSource(
          "https://bitbucket.org/owner/repo/src/main/skills/my-skill",
        );

        expect(result.type).toBe("bitbucket");
        expect(result.canonical).toBe("bitbucket:owner/repo");
        expect(result.ref).toBe("main");
        expect(result.path).toBe("skills/my-skill");
      }),
    );
  });

  describe("Bitbucket SSH URLs", () => {
    it.effect("parses git@bitbucket.org:owner/repo.git", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("git@bitbucket.org:owner/repo.git");

        expect(result.type).toBe("bitbucket");
        expect(result.canonical).toBe("bitbucket:owner/repo");
        expect(result.owner).toBe("owner");
        expect(result.repo).toBe("repo");
      }),
    );

    it.effect("parses git@bitbucket.org:owner/repo (without .git)", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("git@bitbucket.org:owner/repo");

        expect(result.type).toBe("bitbucket");
        expect(result.canonical).toBe("bitbucket:owner/repo");
      }),
    );
  });

  describe("Bitbucket shorthand", () => {
    it.effect("parses bitbucket:owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("bitbucket:owner/repo");

        expect(result.type).toBe("bitbucket");
        expect(result.canonical).toBe("bitbucket:owner/repo");
        expect(result.owner).toBe("owner");
        expect(result.repo).toBe("repo");
      }),
    );

    it.effect("parses bitbucket:owner/repo@ref", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("bitbucket:owner/repo@v1.0.0");

        expect(result.type).toBe("bitbucket");
        expect(result.canonical).toBe("bitbucket:owner/repo");
        expect(result.ref).toBe("v1.0.0");
      }),
    );

    it.effect("parses bitbucket:owner/repo/path@ref", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("bitbucket:owner/repo/skills/my-skill@main");

        expect(result.type).toBe("bitbucket");
        expect(result.canonical).toBe("bitbucket:owner/repo");
        expect(result.path).toBe("skills/my-skill");
        expect(result.ref).toBe("main");
      }),
    );
  });

  describe("local paths (removed)", () => {
    it.effect("fails on ./relative/path", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSource("./relative/path"));

        expect(error).toBeInstanceOf(ParseError);
      }),
    );

    it.effect("fails on ../parent/path", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSource("../parent/path"));

        expect(error).toBeInstanceOf(ParseError);
      }),
    );

    it.effect("fails on /absolute/path", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSource("/absolute/path"));

        expect(error).toBeInstanceOf(ParseError);
      }),
    );

    it.effect("fails on Windows path C:\\path", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSource("C:\\path\\to\\skill"));

        expect(error).toBeInstanceOf(ParseError);
      }),
    );

    it.effect("fails on Windows path with forward slashes C:/path", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSource("C:/path/to/skill"));

        expect(error).toBeInstanceOf(ParseError);
      }),
    );

    it.effect("fails on Windows path D:\\drive", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSource("D:\\other\\drive"));

        expect(error).toBeInstanceOf(ParseError);
      }),
    );
  });

  describe("direct URLs (removed)", () => {
    it.effect("fails on https://example.com/skill.md", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSource("https://example.com/skill.md"));

        expect(error).toBeInstanceOf(ParseError);
      }),
    );

    it.effect("fails on https://example.com/path/to/SKILL.md", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSource("https://example.com/path/to/SKILL.md"));

        expect(error).toBeInstanceOf(ParseError);
      }),
    );

    it.effect("fails on URL with .txt extension", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSource("https://example.com/file.txt"));

        expect(error).toBeInstanceOf(ParseError);
      }),
    );
  });

  describe("well-known URLs (removed)", () => {
    it.effect("fails on https://example.com", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSource("https://example.com"));

        expect(error).toBeInstanceOf(ParseError);
      }),
    );

    it.effect("fails on https://example.com/skills (no extension)", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSource("https://example.com/skills"));

        expect(error).toBeInstanceOf(ParseError);
      }),
    );

    it.effect("fails on https://example.com/path/ (trailing slash)", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSource("https://example.com/path/"));

        expect(error).toBeInstanceOf(ParseError);
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

        expect(result.type).toBe("github");
        expect(result.repo).toBe("repo.js");
      }),
    );

    it.effect("handles repo names with dashes", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("owner/my-awesome-repo");

        expect(result.type).toBe("github");
        expect(result.repo).toBe("my-awesome-repo");
      }),
    );

    it.effect("handles owner names with dashes", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("my-org/repo");

        expect(result.type).toBe("github");
        expect(result.owner).toBe("my-org");
      }),
    );

    it.effect("fails on ./ starting path", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSource("./owner/repo"));

        expect(error).toBeInstanceOf(ParseError);
      }),
    );

    it.effect("fails on ../ starting path", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSource("../owner/repo"));

        expect(error).toBeInstanceOf(ParseError);
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
      const parsed: ParsedSource = {
        type: "github",
        original: "owner/repo",
        canonical: "github:owner/repo",
        owner: "owner",
        repo: "repo",
      };

      const result = await Effect.runPromise(buildCloneUrl(parsed));

      expect(result).toBe("https://github.com/owner/repo.git");
    });

    it("builds GitLab clone URL", async () => {
      const parsed: ParsedSource = {
        type: "gitlab",
        original: "gitlab:owner/repo",
        canonical: "gitlab:owner/repo",
        owner: "owner",
        repo: "repo",
      };

      const result = await Effect.runPromise(buildCloneUrl(parsed));

      expect(result).toBe("https://gitlab.com/owner/repo.git");
    });

    it("builds Bitbucket clone URL", async () => {
      const parsed: ParsedSource = {
        type: "bitbucket",
        original: "bitbucket:owner/repo",
        canonical: "bitbucket:owner/repo",
        owner: "owner",
        repo: "repo",
      };

      const result = await Effect.runPromise(buildCloneUrl(parsed));

      expect(result).toBe("https://bitbucket.org/owner/repo.git");
    });
  });

  describe("getOriginFromParsed", () => {
    it("returns GitHub origin URL", () => {
      const parsed: ParsedSource = {
        type: "github",
        original: "owner/repo",
        canonical: "github:owner/repo",
        owner: "owner",
        repo: "repo",
      };

      const result = getOriginFromParsed(parsed);

      expect(result).toBe("https://github.com/owner/repo");
    });

    it("returns GitLab origin URL", () => {
      const parsed: ParsedSource = {
        type: "gitlab",
        original: "gitlab:owner/repo",
        canonical: "gitlab:owner/repo",
        owner: "owner",
        repo: "repo",
      };

      const result = getOriginFromParsed(parsed);

      expect(result).toBe("https://gitlab.com/owner/repo");
    });

    it("returns Bitbucket origin URL", () => {
      const parsed: ParsedSource = {
        type: "bitbucket",
        original: "bitbucket:owner/repo",
        canonical: "bitbucket:owner/repo",
        owner: "owner",
        repo: "repo",
      };

      const result = getOriginFromParsed(parsed);

      expect(result).toBe("https://bitbucket.org/owner/repo");
    });
  });
});
