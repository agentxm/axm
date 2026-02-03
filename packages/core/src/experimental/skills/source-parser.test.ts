/**
 * Unit tests for source-parser module.
 *
 * Tests parsing of various source formats into normalized ParsedSource structures.
 */

import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import {
  buildCloneUrl,
  CloneUrlError,
  getOriginFromParsed,
  ParseError,
  parseSource,
} from "./source-parser.js";
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

  describe("local paths", () => {
    it.effect("parses ./relative/path", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("./relative/path");

        expect(result.type).toBe("local");
        expect(result.canonical).toBe("./relative/path");
        expect(result.original).toBe("./relative/path");
      }),
    );

    it.effect("parses ../parent/path", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("../parent/path");

        expect(result.type).toBe("local");
        expect(result.canonical).toBe("../parent/path");
      }),
    );

    it.effect("parses /absolute/path", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("/absolute/path");

        expect(result.type).toBe("local");
        expect(result.canonical).toBe("/absolute/path");
      }),
    );

    it.effect("parses Windows path C:\\path", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("C:\\path\\to\\skill");

        expect(result.type).toBe("local");
        expect(result.canonical).toBe("C:\\path\\to\\skill");
      }),
    );

    it.effect("parses Windows path with forward slashes C:/path", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("C:/path/to/skill");

        expect(result.type).toBe("local");
        expect(result.canonical).toBe("C:/path/to/skill");
      }),
    );

    it.effect("parses Windows path D:\\drive", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("D:\\other\\drive");

        expect(result.type).toBe("local");
        expect(result.canonical).toBe("D:\\other\\drive");
      }),
    );
  });

  describe("direct URLs", () => {
    it.effect("parses https://example.com/skill.md as direct-url", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://example.com/skill.md");

        expect(result.type).toBe("direct-url");
        expect(result.canonical).toBe("https://example.com/skill.md");
        expect(result.url).toBe("https://example.com/skill.md");
      }),
    );

    it.effect("parses https://example.com/path/to/SKILL.md as direct-url", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://example.com/path/to/SKILL.md");

        expect(result.type).toBe("direct-url");
        expect(result.url).toBe("https://example.com/path/to/SKILL.md");
      }),
    );

    it.effect("parses URL with .txt extension as direct-url", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://example.com/file.txt");

        expect(result.type).toBe("direct-url");
      }),
    );
  });

  describe("well-known URLs", () => {
    it.effect("parses https://example.com as well-known", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://example.com");

        expect(result.type).toBe("well-known");
        expect(result.canonical).toBe("https://example.com");
        expect(result.url).toBe("https://example.com");
      }),
    );

    it.effect("parses https://example.com/skills as well-known (no extension)", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://example.com/skills");

        expect(result.type).toBe("well-known");
        expect(result.url).toBe("https://example.com/skills");
      }),
    );

    it.effect("parses https://example.com/path/ as well-known (trailing slash)", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://example.com/path/");

        expect(result.type).toBe("well-known");
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

    it.effect("does not parse ./ starting path as shorthand", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("./owner/repo");

        expect(result.type).toBe("local");
      }),
    );

    it.effect("does not parse ../ starting path as shorthand", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("../owner/repo");

        expect(result.type).toBe("local");
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

    it("returns CloneUrlError for local source", async () => {
      const parsed: ParsedSource = {
        type: "local",
        original: "./local/path",
        canonical: "./local/path",
      };

      const result = await Effect.runPromiseExit(buildCloneUrl(parsed));

      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        const error = result.cause._tag === "Fail" ? result.cause.error : null;
        expect(error).toBeInstanceOf(CloneUrlError);
        expect((error as CloneUrlError).message).toBe(
          "Cannot build clone URL for source type: local",
        );
        expect((error as CloneUrlError).sourceType).toBe("local");
      }
    });

    it("returns CloneUrlError for direct-url source", async () => {
      const parsed: ParsedSource = {
        type: "direct-url",
        original: "https://example.com/skill.md",
        canonical: "https://example.com/skill.md",
        url: "https://example.com/skill.md",
      };

      const result = await Effect.runPromiseExit(buildCloneUrl(parsed));

      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        const error = result.cause._tag === "Fail" ? result.cause.error : null;
        expect(error).toBeInstanceOf(CloneUrlError);
        expect((error as CloneUrlError).message).toBe(
          "Cannot build clone URL for source type: direct-url",
        );
      }
    });

    it("returns CloneUrlError for well-known source", async () => {
      const parsed: ParsedSource = {
        type: "well-known",
        original: "https://example.com",
        canonical: "https://example.com",
        url: "https://example.com",
      };

      const result = await Effect.runPromiseExit(buildCloneUrl(parsed));

      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        const error = result.cause._tag === "Fail" ? result.cause.error : null;
        expect(error).toBeInstanceOf(CloneUrlError);
        expect((error as CloneUrlError).message).toBe(
          "Cannot build clone URL for source type: well-known",
        );
      }
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

    it("returns original for local source", () => {
      const parsed: ParsedSource = {
        type: "local",
        original: "./local/path",
        canonical: "./local/path",
      };

      const result = getOriginFromParsed(parsed);

      expect(result).toBe("./local/path");
    });

    it("returns url for direct-url source", () => {
      const parsed: ParsedSource = {
        type: "direct-url",
        original: "https://example.com/skill.md",
        canonical: "https://example.com/skill.md",
        url: "https://example.com/skill.md",
      };

      const result = getOriginFromParsed(parsed);

      expect(result).toBe("https://example.com/skill.md");
    });

    it("returns url for well-known source", () => {
      const parsed: ParsedSource = {
        type: "well-known",
        original: "https://example.com",
        canonical: "https://example.com",
        url: "https://example.com",
      };

      const result = getOriginFromParsed(parsed);

      expect(result).toBe("https://example.com");
    });

    it("falls back to original when url is undefined for direct-url", () => {
      const parsed: ParsedSource = {
        type: "direct-url",
        original: "https://example.com/fallback",
        canonical: "https://example.com/fallback",
      };

      const result = getOriginFromParsed(parsed);

      expect(result).toBe("https://example.com/fallback");
    });

    it("falls back to original when url is undefined for well-known", () => {
      const parsed: ParsedSource = {
        type: "well-known",
        original: "https://example.com/fallback",
        canonical: "https://example.com/fallback",
      };

      const result = getOriginFromParsed(parsed);

      expect(result).toBe("https://example.com/fallback");
    });
  });
});
