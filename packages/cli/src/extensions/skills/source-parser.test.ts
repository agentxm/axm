/**
 * Unit tests for source-parser module.
 *
 * Tests parsing of various source formats into normalized Source structures.
 */

import { describe, expect, it } from "@effect/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { config as githubConfig } from "../../sources/github/config.js";
import { config as gitlabConfig } from "../../sources/gitlab/config.js";
import { config as bitbucketConfig } from "../../sources/bitbucket/config.js";
import {
  buildCloneUrl,
  getOrigin,
  ParseError,
  parseSource,
  printSource,
} from "../../sources/index.js";

describe("source-parser", () => {
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
      if (response) return Promise.resolve(new Response(null, { status: response.ok ? 200 : 404 }));
      return Promise.resolve(new Response(null, { status: 404 }));
    }) as unknown as typeof globalThis.fetch;
  };

  describe("slash pattern (owner/repo)", () => {
    it.effect("parses owner/repo (resolves via GitHub)", () =>
      Effect.gen(function* () {
        mockFetch({ "https://github.com/owner/repo": { ok: true } });
        const result = yield* parseSource("owner/repo");

        expect(result.source).toBe("github");
        expect(printSource(result)).toBe("github:owner/repo");
        if (result.source === "github") {
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
          expect(Option.isNone(result.ref)).toBe(true);
          expect(Option.isNone(result.subPath)).toBe(true);
        }
      }),
    );
  });

  describe("prefixed shorthand", () => {
    it.effect("parses github:owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("github:owner/repo");

        expect(result.source).toBe("github");
        expect(printSource(result)).toBe("github:owner/repo");
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
        expect(printSource(result)).toBe("gitlab:owner/repo");
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
        expect(printSource(result)).toBe("github:owner/repo");
        if (result.source === "github") {
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
          expect(result.subPath).toEqual(Option.some("skills/my-skill"));
          expect(result.ref).toEqual(Option.some("v1.0.0"));
        }
      }),
    );

    it.effect("parses gitlab:owner/repo@ref", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("gitlab:owner/repo@main");

        expect(result.source).toBe("gitlab");
        expect(printSource(result)).toBe("gitlab:owner/repo");
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
        expect(printSource(result)).toBe("github:owner/repo");
        if (result.source === "github") {
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
        }
      }),
    );

    it.effect("parses https://github.com/owner/repo.git", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://github.com/owner/repo.git");

        expect(result.source).toBe("github");
        expect(printSource(result)).toBe("github:owner/repo");
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
        expect(printSource(result)).toBe("github:owner/repo");
        if (result.source === "github") {
          expect(result.ref).toEqual(Option.some("main"));
          expect(Option.isNone(result.subPath)).toBe(true);
        }
      }),
    );

    it.effect("parses https://github.com/owner/repo/tree/branch/path", () =>
      Effect.gen(function* () {
        const result = yield* parseSource(
          "https://github.com/owner/repo/tree/main/skills/my-skill",
        );

        expect(result.source).toBe("github");
        expect(printSource(result)).toBe("github:owner/repo");
        if (result.source === "github") {
          expect(result.ref).toEqual(Option.some("main"));
          expect(result.subPath).toEqual(Option.some("skills/my-skill"));
        }
      }),
    );

    it.effect("parses http://github.com/owner/repo (HTTP)", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("http://github.com/owner/repo");

        expect(result.source).toBe("github");
        expect(printSource(result)).toBe("github:owner/repo");
      }),
    );
  });

  describe("GitLab HTTPS URLs", () => {
    it.effect("parses https://gitlab.com/owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://gitlab.com/owner/repo");

        expect(result.source).toBe("gitlab");
        expect(printSource(result)).toBe("gitlab:owner/repo");
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
        expect(printSource(result)).toBe("gitlab:owner/repo");
      }),
    );

    it.effect("parses https://gitlab.com/owner/repo/-/tree/branch", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://gitlab.com/owner/repo/-/tree/main");

        expect(result.source).toBe("gitlab");
        expect(printSource(result)).toBe("gitlab:owner/repo");
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
        expect(printSource(result)).toBe("gitlab:owner/repo");
        if (result.source === "gitlab") {
          expect(result.ref).toEqual(Option.some("main"));
          expect(result.subPath).toEqual(Option.some("skills/my-skill"));
        }
      }),
    );
  });

  describe("GitHub SSH URLs", () => {
    it.effect("parses git@github.com:owner/repo.git", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("git@github.com:owner/repo.git");

        expect(result.source).toBe("github");
        expect(printSource(result)).toBe("github:owner/repo");
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
        expect(printSource(result)).toBe("github:owner/repo");
      }),
    );
  });

  describe("GitLab SSH URLs", () => {
    it.effect("parses git@gitlab.com:owner/repo.git", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("git@gitlab.com:owner/repo.git");

        expect(result.source).toBe("gitlab");
        expect(printSource(result)).toBe("gitlab:owner/repo");
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
        expect(printSource(result)).toBe("gitlab:owner/repo");
      }),
    );
  });

  describe("Bitbucket HTTPS URLs", () => {
    it.effect("parses https://bitbucket.org/owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://bitbucket.org/owner/repo");

        expect(result.source).toBe("bitbucket");
        expect(printSource(result)).toBe("bitbucket:owner/repo");
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
        expect(printSource(result)).toBe("bitbucket:owner/repo");
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
        expect(printSource(result)).toBe("bitbucket:owner/repo");
        if (result.source === "bitbucket") {
          expect(result.ref).toEqual(Option.some("main"));
          expect(Option.isNone(result.subPath)).toBe(true);
        }
      }),
    );

    it.effect("parses https://bitbucket.org/owner/repo/src/main/skills/my-skill", () =>
      Effect.gen(function* () {
        const result = yield* parseSource(
          "https://bitbucket.org/owner/repo/src/main/skills/my-skill",
        );

        expect(result.source).toBe("bitbucket");
        expect(printSource(result)).toBe("bitbucket:owner/repo");
        if (result.source === "bitbucket") {
          expect(result.ref).toEqual(Option.some("main"));
          expect(result.subPath).toEqual(Option.some("skills/my-skill"));
        }
      }),
    );
  });

  describe("Bitbucket SSH URLs", () => {
    it.effect("parses git@bitbucket.org:owner/repo.git", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("git@bitbucket.org:owner/repo.git");

        expect(result.source).toBe("bitbucket");
        expect(printSource(result)).toBe("bitbucket:owner/repo");
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
        expect(printSource(result)).toBe("bitbucket:owner/repo");
      }),
    );
  });

  describe("Bitbucket shorthand", () => {
    it.effect("parses bitbucket:owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("bitbucket:owner/repo");

        expect(result.source).toBe("bitbucket");
        expect(printSource(result)).toBe("bitbucket:owner/repo");
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
        expect(printSource(result)).toBe("bitbucket:owner/repo");
        if (result.source === "bitbucket") {
          expect(result.ref).toEqual(Option.some("v1.0.0"));
        }
      }),
    );

    it.effect("parses bitbucket:owner/repo/path@ref", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("bitbucket:owner/repo/skills/my-skill@main");

        expect(result.source).toBe("bitbucket");
        expect(printSource(result)).toBe("bitbucket:owner/repo");
        if (result.source === "bitbucket") {
          expect(result.subPath).toEqual(Option.some("skills/my-skill"));
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
        if (result.source === "local") {
          expect(result.path).toBe("./my-skill");
        }
        expect(printSource(result)).toBe("local:./my-skill");
      }),
    );

    it.effect("parses relative path starting with ../", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("../sibling-skill");
        expect(result.source).toBe("local");
        expect(printSource(result)).toBe("local:../sibling-skill");
      }),
    );

    it.effect("parses absolute POSIX path", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("/home/user/skills/my-skill");
        expect(result.source).toBe("local");
        expect(printSource(result)).toBe("local:/home/user/skills/my-skill");
      }),
    );

    it.effect("parses home directory path with ~/", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("~/my-skills/dev-skill");
        expect(result.source).toBe("local");
        expect(printSource(result)).toBe("local:~/my-skills/dev-skill");
      }),
    );

    it.effect("parses home directory path with ~\\ (Windows)", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("~\\my-skills\\dev-skill");
        expect(result.source).toBe("local");
        expect(printSource(result)).toBe("local:~\\my-skills\\dev-skill");
      }),
    );

    it.effect("parses Windows path with drive letter and backslash", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("C:\\Users\\name\\skills");
        expect(result.source).toBe("local");
        expect(printSource(result)).toBe("local:C:\\Users\\name\\skills");
      }),
    );

    it.effect("parses Windows path with drive letter and forward slash", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("C:/Users/name/skills");
        expect(result.source).toBe("local");
        expect(printSource(result)).toBe("local:C:/Users/name/skills");
      }),
    );

    it.effect("fails on local: prefix (no shorthand)", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSource("local:./my-skill"));
        expect(error).toBeInstanceOf(ParseError);
      }),
    );
  });

  describe("unsupported URLs", () => {
    it.effect("fails on unknown HTTPS URLs", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSource("https://example.com"));

        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toContain("Unsupported URL host");
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

    it.effect("fails on name input (not yet supported)", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSource("not-a-valid-source"));

        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toBe("Name input is not yet supported");
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
        mockFetch({ "https://github.com/owner/repo": { ok: true } });
        const result = yield* parseSource("  owner/repo  ");

        expect(printSource(result)).toBe("github:owner/repo");
      }),
    );

    it.effect("handles repo names with dashes", () =>
      Effect.gen(function* () {
        mockFetch({ "https://github.com/owner/my-awesome-repo": { ok: true } });
        const result = yield* parseSource("owner/my-awesome-repo");

        expect(result.source).toBe("github");
        if (result.source === "github") {
          expect(result.repo).toBe("my-awesome-repo");
        }
      }),
    );

    it.effect("handles owner names with dashes", () =>
      Effect.gen(function* () {
        mockFetch({ "https://github.com/my-org/repo": { ok: true } });
        const result = yield* parseSource("my-org/repo");

        expect(result.source).toBe("github");
        if (result.source === "github") {
          expect(result.owner).toBe("my-org");
        }
      }),
    );

    it.effect("rejects repo names with dots (use prefixed form)", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSource("owner/repo.js"));
        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toBe("Unable to parse source");
      }),
    );

    it.effect("parses ./ starting path as local", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("./owner/repo");
        expect(result.source).toBe("local");
        expect(printSource(result)).toBe("local:./owner/repo");
      }),
    );

    it.effect("parses ../ starting path as local", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("../owner/repo");
        expect(result.source).toBe("local");
        expect(printSource(result)).toBe("local:../owner/repo");
      }),
    );
  });

  describe("buildCloneUrl", () => {
    it("builds GitHub clone URL", async () => {
      const source = githubConfig.make({ owner: "owner", repo: "repo" });

      const result = await Effect.runPromise(buildCloneUrl(source));

      expect(result).toBe("https://github.com/owner/repo.git");
    });

    it("builds GitLab clone URL", async () => {
      const source = gitlabConfig.make({ owner: "owner", repo: "repo" });

      const result = await Effect.runPromise(buildCloneUrl(source));

      expect(result).toBe("https://gitlab.com/owner/repo.git");
    });

    it("builds Bitbucket clone URL", async () => {
      const source = bitbucketConfig.make({ owner: "owner", repo: "repo" });

      const result = await Effect.runPromise(buildCloneUrl(source));

      expect(result).toBe("https://bitbucket.org/owner/repo.git");
    });
  });

  describe("getOrigin", () => {
    it("returns GitHub origin URL", () => {
      const source = githubConfig.make({ owner: "owner", repo: "repo" });

      const result = getOrigin(source);

      expect(result).toBe("https://github.com/owner/repo");
    });

    it("returns GitLab origin URL", () => {
      const source = gitlabConfig.make({ owner: "owner", repo: "repo" });

      const result = getOrigin(source);

      expect(result).toBe("https://gitlab.com/owner/repo");
    });

    it("returns Bitbucket origin URL", () => {
      const source = bitbucketConfig.make({ owner: "owner", repo: "repo" });

      const result = getOrigin(source);

      expect(result).toBe("https://bitbucket.org/owner/repo");
    });
  });
});
