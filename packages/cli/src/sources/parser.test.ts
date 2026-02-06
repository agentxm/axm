/**
 * Unit tests for source-parser module.
 *
 * Tests parsing of various source formats into normalized Source structures.
 */

import { describe, expect, it } from "@effect/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { buildCloneUrl, getOrigin } from "./clone-url.js";
import { ParseError } from "./errors.js";
import { type InputPattern, parseInputPattern, parseSource } from "./parser.js";
import { printSource } from "./printer.js";

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
        expect(printSource(result)).toBe("github:owner/repo/skills/my-skill@v1.0.0");
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
        expect(printSource(result)).toBe("gitlab:owner/repo@main");
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
        expect(printSource(result)).toBe("github:owner/repo@main");
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
        expect(printSource(result)).toBe("github:owner/repo/skills/my-skill@main");
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
        expect(printSource(result)).toBe("gitlab:owner/repo@main");
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
        expect(printSource(result)).toBe("gitlab:owner/repo/skills/my-skill@main");
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
        expect(printSource(result)).toBe("bitbucket:owner/repo@main");
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
        expect(printSource(result)).toBe("bitbucket:owner/repo/skills/my-skill@main");
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

  describe("Azure Repos HTTPS URLs", () => {
    it.effect("parses https://dev.azure.com/org/project/_git/repo", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://dev.azure.com/myorg/myproject/_git/myrepo");

        expect(result.source).toBe("azurerepos");
        expect(printSource(result)).toBe("azurerepos:myorg/myproject/myrepo");
        if (result.source === "azurerepos") {
          expect(result.organization).toBe("myorg");
          expect(result.project).toBe("myproject");
          expect(result.repo).toBe("myrepo");
        }
      }),
    );

    it.effect("parses https://dev.azure.com/org/project/_git/repo.git", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://dev.azure.com/myorg/myproject/_git/myrepo.git");

        expect(result.source).toBe("azurerepos");
        expect(printSource(result)).toBe("azurerepos:myorg/myproject/myrepo");
      }),
    );

    it.effect("parses http://dev.azure.com/org/project/_git/repo (HTTP)", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("http://dev.azure.com/myorg/myproject/_git/myrepo");

        expect(result.source).toBe("azurerepos");
        expect(printSource(result)).toBe("azurerepos:myorg/myproject/myrepo");
      }),
    );
  });

  describe("Azure Repos SSH URLs", () => {
    it.effect("parses git@ssh.dev.azure.com:v3/org/project/repo", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("git@ssh.dev.azure.com:v3/myorg/myproject/myrepo");

        expect(result.source).toBe("azurerepos");
        expect(printSource(result)).toBe("azurerepos:myorg/myproject/myrepo");
        if (result.source === "azurerepos") {
          expect(result.organization).toBe("myorg");
          expect(result.project).toBe("myproject");
          expect(result.repo).toBe("myrepo");
        }
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
        expect(printSource(result)).toBe("bitbucket:owner/repo@v1.0.0");
        if (result.source === "bitbucket") {
          expect(result.ref).toEqual(Option.some("v1.0.0"));
        }
      }),
    );

    it.effect("parses bitbucket:owner/repo/path@ref", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("bitbucket:owner/repo/skills/my-skill@main");

        expect(result.source).toBe("bitbucket");
        expect(printSource(result)).toBe("bitbucket:owner/repo/skills/my-skill@main");
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
      const source = {
        source: "github",
        owner: "owner",
        repo: "repo",
        ref: Option.none(),
        subPath: Option.none(),
      } as const;

      const result = await Effect.runPromise(buildCloneUrl(source));

      expect(result).toBe("https://github.com/owner/repo.git");
    });

    it("builds GitLab clone URL", async () => {
      const source = {
        source: "gitlab",
        owner: "owner",
        repo: "repo",
        ref: Option.none(),
        subPath: Option.none(),
      } as const;

      const result = await Effect.runPromise(buildCloneUrl(source));

      expect(result).toBe("https://gitlab.com/owner/repo.git");
    });

    it("builds Bitbucket clone URL", async () => {
      const source = {
        source: "bitbucket",
        owner: "owner",
        repo: "repo",
        ref: Option.none(),
        subPath: Option.none(),
      } as const;

      const result = await Effect.runPromise(buildCloneUrl(source));

      expect(result).toBe("https://bitbucket.org/owner/repo.git");
    });

    it("builds Azure Repos clone URL", async () => {
      const source = {
        source: "azurerepos",
        organization: "myorg",
        project: "myproject",
        repo: "myrepo",
        ref: Option.none(),
        subPath: Option.none(),
      } as const;

      const result = await Effect.runPromise(buildCloneUrl(source));

      expect(result).toBe("https://dev.azure.com/myorg/myproject/_git/myrepo");
    });
  });

  describe("getOrigin", () => {
    it("returns GitHub origin URL", () => {
      const source = {
        source: "github",
        owner: "owner",
        repo: "repo",
        ref: Option.none(),
        subPath: Option.none(),
      } as const;

      const result = getOrigin(source);

      expect(result).toBe("https://github.com/owner/repo");
    });

    it("returns GitLab origin URL", () => {
      const source = {
        source: "gitlab",
        owner: "owner",
        repo: "repo",
        ref: Option.none(),
        subPath: Option.none(),
      } as const;

      const result = getOrigin(source);

      expect(result).toBe("https://gitlab.com/owner/repo");
    });

    it("returns Bitbucket origin URL", () => {
      const source = {
        source: "bitbucket",
        owner: "owner",
        repo: "repo",
        ref: Option.none(),
        subPath: Option.none(),
      } as const;

      const result = getOrigin(source);

      expect(result).toBe("https://bitbucket.org/owner/repo");
    });

    it("returns Azure Repos origin URL", () => {
      const source = {
        source: "azurerepos",
        organization: "myorg",
        project: "myproject",
        repo: "myrepo",
        ref: Option.none(),
        subPath: Option.none(),
      } as const;

      const result = getOrigin(source);

      expect(result).toBe("https://dev.azure.com/myorg/myproject/_git/myrepo");
    });
  });
});

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

  describe("parseSource pattern handling", () => {
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

    it.effect("fails on empty input", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSource(""));
        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toBe("Source string cannot be empty");
      }),
    );

    it.effect("fails on whitespace-only input", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSource("   "));
        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toBe("Source string cannot be empty");
      }),
    );

    it.effect("fails with 'not yet supported' for NameInput", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSource("some-name"));
        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toBe("Name input is not yet supported");
      }),
    );

    it.effect("fails with 'not yet supported' for RegistrySourceInput", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSource("@myorg/some-name"));
        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toBe("Registry source input is not yet supported");
      }),
    );

    it.effect("parses GitHub HTTPS URL via UrlInput", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://github.com/owner/repo");
        expect(result).toMatchObject({ source: "github", owner: "owner", repo: "repo" });
      }),
    );

    it.effect("parses GitLab HTTPS URL via UrlInput", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://gitlab.com/owner/repo");
        expect(result).toMatchObject({ source: "gitlab", owner: "owner", repo: "repo" });
      }),
    );

    it.effect("parses Bitbucket HTTPS URL via UrlInput", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://bitbucket.org/owner/repo");
        expect(result).toMatchObject({
          source: "bitbucket",
          owner: "owner",
          repo: "repo",
        });
      }),
    );

    it.effect("parses Azure Repos HTTPS URL via UrlInput", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("https://dev.azure.com/myorg/myproject/_git/myrepo");
        expect(result).toMatchObject({
          source: "azurerepos",
          organization: "myorg",
          project: "myproject",
          repo: "myrepo",
        });
      }),
    );

    it.effect("parses GitHub SSH via ScpAddress", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("git@github.com:owner/repo.git");
        expect(result.source).toBe("github");
        expect(result).toMatchObject({ owner: "owner", repo: "repo" });
      }),
    );

    it.effect("parses GitLab SSH via ScpAddress", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("git@gitlab.com:owner/repo.git");
        expect(result.source).toBe("gitlab");
        expect(result).toMatchObject({ owner: "owner", repo: "repo" });
      }),
    );

    it.effect("parses Bitbucket SSH via ScpAddress", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("git@bitbucket.org:owner/repo.git");
        expect(result.source).toBe("bitbucket");
        expect(result).toMatchObject({ owner: "owner", repo: "repo" });
      }),
    );

    it.effect("parses Azure Repos SSH via ScpAddress", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("git@ssh.dev.azure.com:v3/myorg/myproject/myrepo");
        expect(result.source).toBe("azurerepos");
        expect(result).toMatchObject({
          organization: "myorg",
          project: "myproject",
          repo: "myrepo",
        });
      }),
    );

    it.effect("fails for unsupported SCP host", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSource("git@example.com:owner/repo.git"));
        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toContain("Unsupported SCP host");
      }),
    );

    it.effect("fails for unsupported URL host", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSource("https://example.com/owner/repo"));
        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toContain("Unsupported URL host");
      }),
    );

    it.effect("rejects invalid URL with unrecognized segments", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseSource("http://"));
        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toBe("Unable to parse source");
      }),
    );

    describe("SlashPattern resolution", () => {
      it.effect("resolves to GitHub when GitHub returns 200", () =>
        Effect.gen(function* () {
          mockFetch({ "https://github.com/owner/repo": { ok: true } });
          const result = yield* parseSource("owner/repo");
          expect(result.source).toBe("github");
          expect(result).toMatchObject({ owner: "owner", repo: "repo" });
          expect(printSource(result)).toBe("github:owner/repo");
        }),
      );

      it.effect("resolves to GitLab when GitHub 404, GitLab 200", () =>
        Effect.gen(function* () {
          mockFetch({
            "https://github.com/owner/repo": { ok: false },
            "https://gitlab.com/owner/repo": { ok: true },
          });
          const result = yield* parseSource("owner/repo");
          expect(result.source).toBe("gitlab");
          expect(result).toMatchObject({ owner: "owner", repo: "repo" });
          expect(printSource(result)).toBe("gitlab:owner/repo");
        }),
      );

      it.effect("resolves to Bitbucket when GitHub 404, GitLab 404, Bitbucket 200", () =>
        Effect.gen(function* () {
          mockFetch({
            "https://github.com/owner/repo": { ok: false },
            "https://gitlab.com/owner/repo": { ok: false },
            "https://bitbucket.org/owner/repo": { ok: true },
          });
          const result = yield* parseSource("owner/repo");
          expect(result.source).toBe("bitbucket");
          expect(result).toMatchObject({ owner: "owner", repo: "repo" });
          expect(printSource(result)).toBe("bitbucket:owner/repo");
        }),
      );

      it.effect("fails when all providers return 404", () =>
        Effect.gen(function* () {
          mockFetch({
            "https://github.com/owner/repo": { ok: false },
            "https://gitlab.com/owner/repo": { ok: false },
            "https://bitbucket.org/owner/repo": { ok: false },
          });
          const error = yield* Effect.flip(parseSource("owner/repo"));
          expect(error).toBeInstanceOf(ParseError);
          expect(error.message).toBe(
            "Repository 'owner/repo' not found on GitHub, GitLab, or Bitbucket",
          );
        }),
      );

      it.effect("fails on GitHub network error (does not fall through)", () =>
        Effect.gen(function* () {
          mockFetch({
            "https://github.com/owner/repo": "error",
            "https://gitlab.com/owner/repo": { ok: true },
          });
          const error = yield* Effect.flip(parseSource("owner/repo"));
          expect(error).toBeInstanceOf(ParseError);
          expect(error.message).toContain("Failed to check GitHub");
        }),
      );

      it.effect("preserves canonical via printSource", () =>
        Effect.gen(function* () {
          mockFetch({ "https://github.com/my-org/my-repo": { ok: true } });
          const result = yield* parseSource("my-org/my-repo");
          expect(printSource(result)).toBe("github:my-org/my-repo");
        }),
      );
    });

    it.effect("parses FilePathPattern via parseLocalPath", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("./local/path");
        expect(result.source).toBe("local");
        expect(printSource(result)).toBe("local:./local/path");
      }),
    );

    describe("ShorthandInput resolution", () => {
      it.effect("resolves github:owner/repo to GitHub source", () =>
        Effect.gen(function* () {
          const result = yield* parseSource("github:owner/repo");
          expect(result).toMatchObject({ source: "github", owner: "owner", repo: "repo" });
          expect(printSource(result)).toBe("github:owner/repo");
        }),
      );

      it.effect("resolves gitlab:owner/repo@main to GitLab source with ref", () =>
        Effect.gen(function* () {
          const result = yield* parseSource("gitlab:owner/repo@main");
          expect(result).toMatchObject({ source: "gitlab", owner: "owner", repo: "repo" });
          if (result.source === "gitlab") {
            expect(result.ref).toEqual(Option.some("main"));
          }
        }),
      );

      it.effect("resolves bitbucket:owner/repo/path@ref to Bitbucket source", () =>
        Effect.gen(function* () {
          const result = yield* parseSource("bitbucket:owner/repo/skills/my-skill@v1.0.0");
          expect(result).toMatchObject({
            source: "bitbucket",
            owner: "owner",
            repo: "repo",
          });
          if (result.source === "bitbucket") {
            expect(result.subPath).toEqual(Option.some("skills/my-skill"));
            expect(result.ref).toEqual(Option.some("v1.0.0"));
          }
        }),
      );

      it.effect("fails on local:./my-skill (no shorthand)", () =>
        Effect.gen(function* () {
          const error = yield* Effect.flip(parseSource("local:./my-skill"));
          expect(error).toBeInstanceOf(ParseError);
        }),
      );
    });
  });
});
