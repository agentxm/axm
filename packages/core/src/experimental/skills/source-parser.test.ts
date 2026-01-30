/**
 * Unit tests for source-parser module.
 *
 * Tests parsing of various source formats into normalized ParsedSource structures.
 */

import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { ParseError, parseSource } from "./source-parser.js";

describe("source-parser", () => {
  /**
   * Helper to run parseSource and return the result
   */
  const parse = (input: string) => Effect.runPromise(parseSource(input));

  /**
   * Helper to run parseSource and expect failure
   */
  const parseError = (input: string) =>
    Effect.runPromise(parseSource(input).pipe(Effect.either)).then((result) => {
      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        return result.left;
      }
      throw new Error("Expected failure but got success");
    });

  describe("GitHub shorthand", () => {
    it("parses owner/repo", async () => {
      const result = await parse("owner/repo");

      expect(result.type).toBe("github");
      expect(result.canonical).toBe("github:owner/repo");
      expect(result.owner).toBe("owner");
      expect(result.repo).toBe("repo");
      expect(result.ref).toBeUndefined();
      expect(result.path).toBeUndefined();
    });

    it("parses owner/repo@ref", async () => {
      const result = await parse("owner/repo@v1.0.0");

      expect(result.type).toBe("github");
      expect(result.canonical).toBe("github:owner/repo");
      expect(result.owner).toBe("owner");
      expect(result.repo).toBe("repo");
      expect(result.ref).toBe("v1.0.0");
      expect(result.path).toBeUndefined();
    });

    it("parses owner/repo/path", async () => {
      const result = await parse("owner/repo/skills/my-skill");

      expect(result.type).toBe("github");
      expect(result.canonical).toBe("github:owner/repo");
      expect(result.owner).toBe("owner");
      expect(result.repo).toBe("repo");
      expect(result.ref).toBeUndefined();
      expect(result.path).toBe("skills/my-skill");
    });

    it("parses owner/repo/path@ref", async () => {
      const result = await parse("owner/repo/skills/my-skill@main");

      expect(result.type).toBe("github");
      expect(result.canonical).toBe("github:owner/repo");
      expect(result.owner).toBe("owner");
      expect(result.repo).toBe("repo");
      expect(result.ref).toBe("main");
      expect(result.path).toBe("skills/my-skill");
    });

    it("parses owner/repo with branch ref", async () => {
      const result = await parse("owner/repo@feature/branch");

      expect(result.type).toBe("github");
      expect(result.ref).toBe("feature/branch");
    });

    it("parses owner/repo with commit SHA", async () => {
      const result = await parse("owner/repo@abc123def456");

      expect(result.type).toBe("github");
      expect(result.ref).toBe("abc123def456");
    });
  });

  describe("prefixed shorthand", () => {
    it("parses github:owner/repo", async () => {
      const result = await parse("github:owner/repo");

      expect(result.type).toBe("github");
      expect(result.canonical).toBe("github:owner/repo");
      expect(result.owner).toBe("owner");
      expect(result.repo).toBe("repo");
    });

    it("parses gitlab:owner/repo", async () => {
      const result = await parse("gitlab:owner/repo");

      expect(result.type).toBe("gitlab");
      expect(result.canonical).toBe("gitlab:owner/repo");
      expect(result.owner).toBe("owner");
      expect(result.repo).toBe("repo");
    });

    it("parses github:owner/repo/path@ref", async () => {
      const result = await parse("github:owner/repo/skills/my-skill@v1.0.0");

      expect(result.type).toBe("github");
      expect(result.canonical).toBe("github:owner/repo");
      expect(result.owner).toBe("owner");
      expect(result.repo).toBe("repo");
      expect(result.path).toBe("skills/my-skill");
      expect(result.ref).toBe("v1.0.0");
    });

    it("parses gitlab:owner/repo@ref", async () => {
      const result = await parse("gitlab:owner/repo@main");

      expect(result.type).toBe("gitlab");
      expect(result.canonical).toBe("gitlab:owner/repo");
      expect(result.ref).toBe("main");
    });
  });

  describe("GitHub HTTPS URLs", () => {
    it("parses https://github.com/owner/repo", async () => {
      const result = await parse("https://github.com/owner/repo");

      expect(result.type).toBe("github");
      expect(result.canonical).toBe("github:owner/repo");
      expect(result.owner).toBe("owner");
      expect(result.repo).toBe("repo");
      expect(result.original).toBe("https://github.com/owner/repo");
    });

    it("parses https://github.com/owner/repo.git", async () => {
      const result = await parse("https://github.com/owner/repo.git");

      expect(result.type).toBe("github");
      expect(result.canonical).toBe("github:owner/repo");
      expect(result.owner).toBe("owner");
      expect(result.repo).toBe("repo");
    });

    it("parses https://github.com/owner/repo/tree/branch", async () => {
      const result = await parse("https://github.com/owner/repo/tree/main");

      expect(result.type).toBe("github");
      expect(result.canonical).toBe("github:owner/repo");
      expect(result.ref).toBe("main");
      expect(result.path).toBeUndefined();
    });

    it("parses https://github.com/owner/repo/tree/branch/path", async () => {
      const result = await parse("https://github.com/owner/repo/tree/main/skills/my-skill");

      expect(result.type).toBe("github");
      expect(result.canonical).toBe("github:owner/repo");
      expect(result.ref).toBe("main");
      expect(result.path).toBe("skills/my-skill");
    });

    it("parses http://github.com/owner/repo (HTTP)", async () => {
      const result = await parse("http://github.com/owner/repo");

      expect(result.type).toBe("github");
      expect(result.canonical).toBe("github:owner/repo");
    });
  });

  describe("GitLab HTTPS URLs", () => {
    it("parses https://gitlab.com/owner/repo", async () => {
      const result = await parse("https://gitlab.com/owner/repo");

      expect(result.type).toBe("gitlab");
      expect(result.canonical).toBe("gitlab:owner/repo");
      expect(result.owner).toBe("owner");
      expect(result.repo).toBe("repo");
    });

    it("parses https://gitlab.com/owner/repo.git", async () => {
      const result = await parse("https://gitlab.com/owner/repo.git");

      expect(result.type).toBe("gitlab");
      expect(result.canonical).toBe("gitlab:owner/repo");
    });

    it("parses https://gitlab.com/owner/repo/-/tree/branch", async () => {
      const result = await parse("https://gitlab.com/owner/repo/-/tree/main");

      expect(result.type).toBe("gitlab");
      expect(result.canonical).toBe("gitlab:owner/repo");
      expect(result.ref).toBe("main");
    });

    it("parses https://gitlab.com/owner/repo/-/tree/branch/path", async () => {
      const result = await parse("https://gitlab.com/owner/repo/-/tree/main/skills/my-skill");

      expect(result.type).toBe("gitlab");
      expect(result.canonical).toBe("gitlab:owner/repo");
      expect(result.ref).toBe("main");
      expect(result.path).toBe("skills/my-skill");
    });
  });

  describe("GitHub SSH URLs", () => {
    it("parses git@github.com:owner/repo.git", async () => {
      const result = await parse("git@github.com:owner/repo.git");

      expect(result.type).toBe("github");
      expect(result.canonical).toBe("github:owner/repo");
      expect(result.owner).toBe("owner");
      expect(result.repo).toBe("repo");
    });

    it("parses git@github.com:owner/repo (without .git)", async () => {
      const result = await parse("git@github.com:owner/repo");

      expect(result.type).toBe("github");
      expect(result.canonical).toBe("github:owner/repo");
    });
  });

  describe("GitLab SSH URLs", () => {
    it("parses git@gitlab.com:owner/repo.git", async () => {
      const result = await parse("git@gitlab.com:owner/repo.git");

      expect(result.type).toBe("gitlab");
      expect(result.canonical).toBe("gitlab:owner/repo");
      expect(result.owner).toBe("owner");
      expect(result.repo).toBe("repo");
    });

    it("parses git@gitlab.com:owner/repo (without .git)", async () => {
      const result = await parse("git@gitlab.com:owner/repo");

      expect(result.type).toBe("gitlab");
      expect(result.canonical).toBe("gitlab:owner/repo");
    });
  });

  describe("local paths", () => {
    it("parses ./relative/path", async () => {
      const result = await parse("./relative/path");

      expect(result.type).toBe("local");
      expect(result.canonical).toBe("./relative/path");
      expect(result.original).toBe("./relative/path");
    });

    it("parses ../parent/path", async () => {
      const result = await parse("../parent/path");

      expect(result.type).toBe("local");
      expect(result.canonical).toBe("../parent/path");
    });

    it("parses /absolute/path", async () => {
      const result = await parse("/absolute/path");

      expect(result.type).toBe("local");
      expect(result.canonical).toBe("/absolute/path");
    });

    it("parses Windows path C:\\path", async () => {
      const result = await parse("C:\\path\\to\\skill");

      expect(result.type).toBe("local");
      expect(result.canonical).toBe("C:\\path\\to\\skill");
    });

    it("parses Windows path with forward slashes C:/path", async () => {
      const result = await parse("C:/path/to/skill");

      expect(result.type).toBe("local");
      expect(result.canonical).toBe("C:/path/to/skill");
    });

    it("parses Windows path D:\\drive", async () => {
      const result = await parse("D:\\other\\drive");

      expect(result.type).toBe("local");
      expect(result.canonical).toBe("D:\\other\\drive");
    });
  });

  describe("direct URLs", () => {
    it("parses https://example.com/skill.md as direct-url", async () => {
      const result = await parse("https://example.com/skill.md");

      expect(result.type).toBe("direct-url");
      expect(result.canonical).toBe("https://example.com/skill.md");
      expect(result.url).toBe("https://example.com/skill.md");
    });

    it("parses https://example.com/path/to/SKILL.md as direct-url", async () => {
      const result = await parse("https://example.com/path/to/SKILL.md");

      expect(result.type).toBe("direct-url");
      expect(result.url).toBe("https://example.com/path/to/SKILL.md");
    });

    it("parses URL with .txt extension as direct-url", async () => {
      const result = await parse("https://example.com/file.txt");

      expect(result.type).toBe("direct-url");
    });
  });

  describe("well-known URLs", () => {
    it("parses https://example.com as well-known", async () => {
      const result = await parse("https://example.com");

      expect(result.type).toBe("well-known");
      expect(result.canonical).toBe("https://example.com");
      expect(result.url).toBe("https://example.com");
    });

    it("parses https://example.com/skills as well-known (no extension)", async () => {
      const result = await parse("https://example.com/skills");

      expect(result.type).toBe("well-known");
      expect(result.url).toBe("https://example.com/skills");
    });

    it("parses https://example.com/path/ as well-known (trailing slash)", async () => {
      const result = await parse("https://example.com/path/");

      expect(result.type).toBe("well-known");
    });
  });

  describe("error handling", () => {
    it("fails on empty string", async () => {
      const error = await parseError("");

      expect(error).toBeInstanceOf(ParseError);
      expect(error.message).toBe("Source string cannot be empty");
    });

    it("fails on whitespace-only string", async () => {
      const error = await parseError("   ");

      expect(error).toBeInstanceOf(ParseError);
      expect(error.message).toBe("Source string cannot be empty");
    });

    it("fails on invalid source format", async () => {
      const error = await parseError("not-a-valid-source");

      expect(error).toBeInstanceOf(ParseError);
      expect(error.message).toContain("Unable to parse source");
    });

    it("includes input in error", async () => {
      const error = await parseError("invalid");

      expect(error.input).toBe("invalid");
    });
  });

  describe("edge cases", () => {
    it("trims whitespace from input", async () => {
      const result = await parse("  owner/repo  ");

      expect(result.canonical).toBe("github:owner/repo");
    });

    it("handles repo names with dots", async () => {
      const result = await parse("owner/repo.js");

      expect(result.type).toBe("github");
      expect(result.repo).toBe("repo.js");
    });

    it("handles repo names with dashes", async () => {
      const result = await parse("owner/my-awesome-repo");

      expect(result.type).toBe("github");
      expect(result.repo).toBe("my-awesome-repo");
    });

    it("handles owner names with dashes", async () => {
      const result = await parse("my-org/repo");

      expect(result.type).toBe("github");
      expect(result.owner).toBe("my-org");
    });

    it("does not parse ./ starting path as shorthand", async () => {
      const result = await parse("./owner/repo");

      expect(result.type).toBe("local");
    });

    it("does not parse ../ starting path as shorthand", async () => {
      const result = await parse("../owner/repo");

      expect(result.type).toBe("local");
    });

    it("preserves original input in result", async () => {
      const input = "https://github.com/owner/repo/tree/main/path";
      const result = await parse(input);

      expect(result.original).toBe(input);
    });
  });
});
