/**
 * Unit tests for source-parser module.
 *
 * Tests parsing of various source formats into normalized SourceInput structures.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { buildCloneUrl, getOrigin } from "./clone-url.js";
import { ParseError } from "./errors.js";
import { type InputPattern, parseInputPattern, determineSourceInput } from "./parser.js";
import { printSource } from "./printer.js";
import type { SkillLockEntry, SkillsLockMap } from "../lockfile/index.js";
import { Workspace } from "../workspace/index.js";

// -----------------------------------------------------------------------------
// Test helpers
// -----------------------------------------------------------------------------

const now = new Date();

/** Create a mock Workspace layer with the given skills map. */
const makeWorkspaceLayer = (skills: SkillsLockMap) =>
  Layer.succeed(Workspace, {
    getLockedSkills: () => Effect.succeed(skills),
  } as unknown as Workspace["Type"]);

/** Empty workspace layer for tests that don't exercise NameInput. */
const EmptyWorkspaceLayer = makeWorkspaceLayer({});

/** Helper: provide the empty workspace layer for determineSourceInput calls. */
const determine = (input: string) =>
  determineSourceInput(input).pipe(Effect.provide(EmptyWorkspaceLayer));

/** Helper: provide a specific workspace layer for determineSourceInput calls. */
const determineWith = (input: string, skills: SkillsLockMap) =>
  determineSourceInput(input).pipe(Effect.provide(makeWorkspaceLayer(skills)));

/** Create a GitHub lock entry for testing. */
const makeGitHubLockEntry = (owner: string, repo: string): SkillLockEntry => ({
  source: "github",
  owner,
  repo,
  agents: [],
  installedAt: now,
  updatedAt: now,
});

/** Create a registry lock entry for testing. */
const makeRegistryLockEntry = (scope: string, name: string): SkillLockEntry => ({
  source: "registry",
  scope,
  name,
  resolvedVersion: "1.0.0",
  checksum: "abc123",
  sourceName: "default",
  agents: [],
  installedAt: now,
  updatedAt: now,
});

describe("source-parser", () => {
  describe("slash pattern (owner/repo)", () => {
    it.effect("rejects ambiguous owner/repo pattern", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(determine("owner/repo"));
        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toContain("Ambiguous pattern");
      }),
    );
  });

  describe("prefixed shorthand", () => {
    it.effect("parses github:owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* determine("github:owner/repo");

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
        const result = yield* determine("gitlab:owner/repo");

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
        const result = yield* determine("github:owner/repo/skills/my-skill@v1.0.0");

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
        const result = yield* determine("gitlab:owner/repo@main");

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
        const result = yield* determine("https://github.com/owner/repo");

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
        const result = yield* determine("https://github.com/owner/repo.git");

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
        const result = yield* determine("https://github.com/owner/repo/tree/main");

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
        const result = yield* determine("https://github.com/owner/repo/tree/main/skills/my-skill");

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
        const result = yield* determine("http://github.com/owner/repo");

        expect(result.source).toBe("github");
        expect(printSource(result)).toBe("github:owner/repo");
      }),
    );
  });

  describe("GitLab HTTPS URLs", () => {
    it.effect("parses https://gitlab.com/owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* determine("https://gitlab.com/owner/repo");

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
        const result = yield* determine("https://gitlab.com/owner/repo.git");

        expect(result.source).toBe("gitlab");
        expect(printSource(result)).toBe("gitlab:owner/repo");
      }),
    );

    it.effect("parses https://gitlab.com/owner/repo/-/tree/branch", () =>
      Effect.gen(function* () {
        const result = yield* determine("https://gitlab.com/owner/repo/-/tree/main");

        expect(result.source).toBe("gitlab");
        expect(printSource(result)).toBe("gitlab:owner/repo@main");
        if (result.source === "gitlab") {
          expect(result.ref).toEqual(Option.some("main"));
        }
      }),
    );

    it.effect("parses https://gitlab.com/owner/repo/-/tree/branch/path", () =>
      Effect.gen(function* () {
        const result = yield* determine(
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
        const result = yield* determine("git@github.com:owner/repo.git");

        expect(result.source).toBe("github");
        expect(printSource(result)).toBe("github:owner/repo");
        if (result.source === "github") {
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
        }
      }),
    );

    it.effect("parses git@github.com:owner/repo.git", () =>
      Effect.gen(function* () {
        const result = yield* determine("git@github.com:owner/repo.git");

        expect(result.source).toBe("github");
        expect(printSource(result)).toBe("github:owner/repo");
      }),
    );

    it.effect("parses git@github.com:owner/repo (without .git)", () =>
      Effect.gen(function* () {
        const result = yield* determine("git@github.com:owner/repo");

        expect(result.source).toBe("github");
        expect(printSource(result)).toBe("github:owner/repo");
      }),
    );
  });

  describe("GitLab SSH URLs", () => {
    it.effect("parses git@gitlab.com:owner/repo.git", () =>
      Effect.gen(function* () {
        const result = yield* determine("git@gitlab.com:owner/repo.git");

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
        const result = yield* determine("git@gitlab.com:owner/repo");

        expect(result.source).toBe("gitlab");
        expect(printSource(result)).toBe("gitlab:owner/repo");
      }),
    );
  });

  describe("Bitbucket HTTPS URLs", () => {
    it.effect("parses https://bitbucket.org/owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* determine("https://bitbucket.org/owner/repo");

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
        const result = yield* determine("https://bitbucket.org/owner/repo.git");

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
        const result = yield* determine("https://bitbucket.org/owner/repo/src/main");

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
        const result = yield* determine(
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
        const result = yield* determine("git@bitbucket.org:owner/repo.git");

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
        const result = yield* determine("git@bitbucket.org:owner/repo");

        expect(result.source).toBe("bitbucket");
        expect(printSource(result)).toBe("bitbucket:owner/repo");
      }),
    );
  });

  describe("Azure Repos HTTPS URLs", () => {
    it.effect("parses https://dev.azure.com/org/project/_git/repo", () =>
      Effect.gen(function* () {
        const result = yield* determine("https://dev.azure.com/myorg/myproject/_git/myrepo");

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
        const result = yield* determine("https://dev.azure.com/myorg/myproject/_git/myrepo.git");

        expect(result.source).toBe("azurerepos");
        expect(printSource(result)).toBe("azurerepos:myorg/myproject/myrepo");
      }),
    );

    it.effect("parses http://dev.azure.com/org/project/_git/repo (HTTP)", () =>
      Effect.gen(function* () {
        const result = yield* determine("http://dev.azure.com/myorg/myproject/_git/myrepo");

        expect(result.source).toBe("azurerepos");
        expect(printSource(result)).toBe("azurerepos:myorg/myproject/myrepo");
      }),
    );
  });

  describe("Azure Repos SSH URLs", () => {
    it.effect("parses git@ssh.dev.azure.com:v3/org/project/repo.git", () =>
      Effect.gen(function* () {
        const result = yield* determine("git@ssh.dev.azure.com:v3/myorg/myproject/myrepo.git");

        expect(result.source).toBe("azurerepos");
        expect(printSource(result)).toBe("azurerepos:myorg/myproject/myrepo");
        if (result.source === "azurerepos") {
          expect(result.organization).toBe("myorg");
          expect(result.project).toBe("myproject");
          expect(result.repo).toBe("myrepo");
        }
      }),
    );

    it.effect("parses git@ssh.dev.azure.com:v3/org/project/repo (without .git)", () =>
      Effect.gen(function* () {
        const result = yield* determine("git@ssh.dev.azure.com:v3/myorg/myproject/myrepo");

        expect(result.source).toBe("azurerepos");
        expect(printSource(result)).toBe("azurerepos:myorg/myproject/myrepo");
      }),
    );
  });

  describe("Bitbucket shorthand", () => {
    it.effect("parses bitbucket:owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* determine("bitbucket:owner/repo");

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
        const result = yield* determine("bitbucket:owner/repo@v1.0.0");

        expect(result.source).toBe("bitbucket");
        expect(printSource(result)).toBe("bitbucket:owner/repo@v1.0.0");
        if (result.source === "bitbucket") {
          expect(result.ref).toEqual(Option.some("v1.0.0"));
        }
      }),
    );

    it.effect("parses bitbucket:owner/repo/path@ref", () =>
      Effect.gen(function* () {
        const result = yield* determine("bitbucket:owner/repo/skills/my-skill@main");

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
        const result = yield* determine("./my-skill");
        expect(result.source).toBe("local");
        if (result.source === "local") {
          expect(result.path).toBe("./my-skill");
        }
        expect(printSource(result)).toBe("./my-skill");
      }),
    );

    it.effect("parses relative path starting with ../", () =>
      Effect.gen(function* () {
        const result = yield* determine("../sibling-skill");
        expect(result.source).toBe("local");
        expect(printSource(result)).toBe("../sibling-skill");
      }),
    );

    it.effect("parses absolute POSIX path", () =>
      Effect.gen(function* () {
        const result = yield* determine("/home/user/skills/my-skill");
        expect(result.source).toBe("local");
        expect(printSource(result)).toBe("/home/user/skills/my-skill");
      }),
    );

    it.effect("parses home directory path with ~/", () =>
      Effect.gen(function* () {
        const result = yield* determine("~/my-skills/dev-skill");
        expect(result.source).toBe("local");
        expect(printSource(result)).toBe("~/my-skills/dev-skill");
      }),
    );

    it.effect("parses home directory path with ~\\ (Windows)", () =>
      Effect.gen(function* () {
        const result = yield* determine("~\\my-skills\\dev-skill");
        expect(result.source).toBe("local");
        expect(printSource(result)).toBe("~\\my-skills\\dev-skill");
      }),
    );

    it.effect("parses Windows path with drive letter and backslash", () =>
      Effect.gen(function* () {
        const result = yield* determine("C:\\Users\\name\\skills");
        expect(result.source).toBe("local");
        expect(printSource(result)).toBe("C:\\Users\\name\\skills");
      }),
    );

    it.effect("parses Windows path with drive letter and forward slash", () =>
      Effect.gen(function* () {
        const result = yield* determine("C:/Users/name/skills");
        expect(result.source).toBe("local");
        expect(printSource(result)).toBe("C:/Users/name/skills");
      }),
    );

    it.effect("fails on local: prefix (no shorthand)", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(determine("local:./my-skill"));
        expect(error).toBeInstanceOf(ParseError);
      }),
    );
  });

  describe("unsupported URLs", () => {
    it.effect("fails on unknown HTTPS URLs", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(determine("https://example.com"));

        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toContain("Unsupported URL host");
      }),
    );
  });

  describe("error handling", () => {
    it.effect("fails on empty string", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(determine(""));

        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toBe("Source string cannot be empty");
      }),
    );

    it.effect("fails on whitespace-only string", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(determine("   "));

        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toBe("Source string cannot be empty");
      }),
    );

    it.effect("fails on unknown skill name", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(determine("not-a-valid-source"));

        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toContain('Unknown skill "not-a-valid-source"');
        expect(error.message).toContain("axm skills list");
      }),
    );

    it.effect("includes input in error", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(determine("invalid"));

        expect(error.input).toBe("invalid");
      }),
    );
  });

  describe("NameInput resolution", () => {
    it.effect("resolves installed skill name to local source", () =>
      Effect.gen(function* () {
        const skills: SkillsLockMap = {
          "my-skill": makeGitHubLockEntry("owner", "repo"),
        };
        const result = yield* determineWith("my-skill", skills);

        expect(result.source).toBe("local");
        if (result.source === "local") {
          expect(result.path).toBe(".agents/skills/my-skill");
        }
      }),
    );

    it.effect("resolves registry skill name to registry extensions path", () =>
      Effect.gen(function* () {
        const skills: SkillsLockMap = {
          "my-skill": makeRegistryLockEntry("acme", "my-skill"),
        };
        const result = yield* determineWith("my-skill", skills);

        expect(result.source).toBe("local");
        if (result.source === "local") {
          expect(result.path).toBe(".axm/extensions/acme/skills/my-skill");
        }
      }),
    );

    it.effect("fails with descriptive error for unknown skill name", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(determineWith("unknown-skill", {}));

        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toContain('Unknown skill "unknown-skill"');
        expect(error.message).toContain("axm skills list");
        expect(error.input).toBe("unknown-skill");
      }),
    );
  });

  describe("edge cases", () => {
    it.effect("trims whitespace from input", () =>
      Effect.gen(function* () {
        const result = yield* determine("  github:owner/repo  ");
        expect(printSource(result)).toBe("github:owner/repo");
      }),
    );

    it.effect("handles repo names with dashes in prefixed form", () =>
      Effect.gen(function* () {
        const result = yield* determine("github:owner/my-awesome-repo");

        expect(result.source).toBe("github");
        if (result.source === "github") {
          expect(result.repo).toBe("my-awesome-repo");
        }
      }),
    );

    it.effect("handles owner names with dashes in prefixed form", () =>
      Effect.gen(function* () {
        const result = yield* determine("github:my-org/repo");

        expect(result.source).toBe("github");
        if (result.source === "github") {
          expect(result.owner).toBe("my-org");
        }
      }),
    );

    it.effect("rejects repo names with dots (use prefixed form)", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(determine("owner/repo.js"));
        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toBe("Unable to parse source");
      }),
    );

    it.effect("parses ./ starting path as local", () =>
      Effect.gen(function* () {
        const result = yield* determine("./owner/repo");
        expect(result.source).toBe("local");
        expect(printSource(result)).toBe("./owner/repo");
      }),
    );

    it.effect("parses ../ starting path as local", () =>
      Effect.gen(function* () {
        const result = yield* determine("../owner/repo");
        expect(result.source).toBe("local");
        expect(printSource(result)).toBe("../owner/repo");
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

  describe("determineSourceInput pattern handling", () => {
    it.effect("fails on empty input", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(determine(""));
        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toBe("Source string cannot be empty");
      }),
    );

    it.effect("fails on whitespace-only input", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(determine("   "));
        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toBe("Source string cannot be empty");
      }),
    );

    it.effect("resolves installed NameInput to local source", () =>
      Effect.gen(function* () {
        const skills: SkillsLockMap = {
          "some-name": makeGitHubLockEntry("owner", "repo"),
        };
        const result = yield* determineWith("some-name", skills);
        expect(result.source).toBe("local");
        if (result.source === "local") {
          expect(result.path).toBe(".agents/skills/some-name");
        }
      }),
    );

    it.effect("fails for unknown NameInput", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(determine("some-name"));
        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toContain('Unknown skill "some-name"');
      }),
    );

    it.effect("fails with 'not yet supported' for RegistryPatternInput", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(determine("@myorg/some-name"));
        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toBe("Registry source input is not yet supported");
      }),
    );

    it.effect("parses GitHub HTTPS URL via UrlInput", () =>
      Effect.gen(function* () {
        const result = yield* determine("https://github.com/owner/repo");
        expect(result).toMatchObject({ source: "github", owner: "owner", repo: "repo" });
      }),
    );

    it.effect("parses GitLab HTTPS URL via UrlInput", () =>
      Effect.gen(function* () {
        const result = yield* determine("https://gitlab.com/owner/repo");
        expect(result).toMatchObject({ source: "gitlab", owner: "owner", repo: "repo" });
      }),
    );

    it.effect("parses Bitbucket HTTPS URL via UrlInput", () =>
      Effect.gen(function* () {
        const result = yield* determine("https://bitbucket.org/owner/repo");
        expect(result).toMatchObject({
          source: "bitbucket",
          owner: "owner",
          repo: "repo",
        });
      }),
    );

    it.effect("parses Azure Repos HTTPS URL via UrlInput", () =>
      Effect.gen(function* () {
        const result = yield* determine("https://dev.azure.com/myorg/myproject/_git/myrepo");
        expect(result).toMatchObject({
          source: "azurerepos",
          organization: "myorg",
          project: "myproject",
          repo: "myrepo",
        });
      }),
    );

    it.effect("parses GitHub SSH via GitScpAddress", () =>
      Effect.gen(function* () {
        const result = yield* determine("git@github.com:owner/repo.git");
        expect(result.source).toBe("github");
        expect(result).toMatchObject({ owner: "owner", repo: "repo" });
      }),
    );

    it.effect("parses GitLab SSH via GitScpAddress", () =>
      Effect.gen(function* () {
        const result = yield* determine("git@gitlab.com:owner/repo.git");
        expect(result.source).toBe("gitlab");
        expect(result).toMatchObject({ owner: "owner", repo: "repo" });
      }),
    );

    it.effect("parses Bitbucket SSH via GitScpAddress", () =>
      Effect.gen(function* () {
        const result = yield* determine("git@bitbucket.org:owner/repo.git");
        expect(result.source).toBe("bitbucket");
        expect(result).toMatchObject({ owner: "owner", repo: "repo" });
      }),
    );

    it.effect("parses Azure Repos SSH via GitScpAddress", () =>
      Effect.gen(function* () {
        const result = yield* determine("git@ssh.dev.azure.com:v3/myorg/myproject/myrepo.git");
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
        const error = yield* Effect.flip(determine("git@example.com:owner/repo.git"));
        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toContain("Unsupported SCP host");
      }),
    );

    it.effect("fails for unsupported URL host", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(determine("https://example.com/owner/repo"));
        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toContain("Unsupported URL host");
      }),
    );

    it.effect("rejects invalid URL with unrecognized segments", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(determine("http://"));
        expect(error).toBeInstanceOf(ParseError);
        expect(error.message).toBe("Unable to parse source");
      }),
    );

    describe("SlashPattern resolution", () => {
      it.effect("rejects ambiguous owner/repo pattern", () =>
        Effect.gen(function* () {
          const error = yield* Effect.flip(determine("owner/repo"));
          expect(error).toBeInstanceOf(ParseError);
          expect(error.message).toContain("Ambiguous pattern 'owner/repo'");
          expect(error.message).toContain("use github:owner/repo");
        }),
      );

      it.effect("suggests prefixed forms for disambiguation", () =>
        Effect.gen(function* () {
          const error = yield* Effect.flip(determine("my-org/my-repo"));
          expect(error).toBeInstanceOf(ParseError);
          expect(error.message).toContain("github:my-org/my-repo");
          expect(error.message).toContain("gitlab:my-org/my-repo");
          expect(error.message).toContain("bitbucket:my-org/my-repo");
        }),
      );
    });

    it.effect("parses FilePathPattern via parseLocalPath", () =>
      Effect.gen(function* () {
        const result = yield* determine("./local/path");
        expect(result.source).toBe("local");
        expect(printSource(result)).toBe("./local/path");
      }),
    );

    describe("ShorthandInput resolution", () => {
      it.effect("resolves github:owner/repo to GitHub source", () =>
        Effect.gen(function* () {
          const result = yield* determine("github:owner/repo");
          expect(result).toMatchObject({ source: "github", owner: "owner", repo: "repo" });
          expect(printSource(result)).toBe("github:owner/repo");
        }),
      );

      it.effect("resolves gitlab:owner/repo@main to GitLab source with ref", () =>
        Effect.gen(function* () {
          const result = yield* determine("gitlab:owner/repo@main");
          expect(result).toMatchObject({ source: "gitlab", owner: "owner", repo: "repo" });
          if (result.source === "gitlab") {
            expect(result.ref).toEqual(Option.some("main"));
          }
        }),
      );

      it.effect("resolves bitbucket:owner/repo/path@ref to Bitbucket source", () =>
        Effect.gen(function* () {
          const result = yield* determine("bitbucket:owner/repo/skills/my-skill@v1.0.0");
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
          const error = yield* Effect.flip(determine("local:./my-skill"));
          expect(error).toBeInstanceOf(ParseError);
        }),
      );
    });
  });
});
