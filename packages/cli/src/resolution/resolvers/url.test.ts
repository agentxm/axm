/**
 * Unit tests for URL resolver.
 *
 * Tests resolution of URL-like inputs (GitHub/GitLab HTTPS, SSH, and other URLs) to ExtensionRefs.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { LockfileService } from "../../lockfile/index.js";
import { resolveUrl } from "./url.js";

/** Empty lockfile layer — resolveUrl never hits the NameInput branch. */
const EmptyLockfileLayer = Layer.succeed(LockfileService, {
  getSkills: () => Effect.succeed({}),
  getEntry: () => Effect.succeed(Option.none()),
  updateEntry: () => Effect.void,
  removeEntry: () => Effect.void,
});

/** Wrap resolveUrl with the empty lockfile layer. */
const resolve = (input: string) => resolveUrl(input).pipe(Effect.provide(EmptyLockfileLayer));

describe("url resolver", () => {
  describe("GitHub HTTPS URLs", () => {
    it.effect("resolves https://github.com/owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* resolve("https://github.com/owner/repo");

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: "skill",
          source: "github",
          origin: "https://github.com/owner/repo",
          originalInput: "https://github.com/owner/repo",
        });
        expect(Option.isNone(result[0]!.ref)).toBe(true);
        expect(Option.isNone(result[0]!.path)).toBe(true);
      }),
    );

    it.effect("resolves https://github.com/owner/repo.git", () =>
      Effect.gen(function* () {
        const result = yield* resolve("https://github.com/owner/repo.git");

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: "skill",
          source: "github",
          origin: "https://github.com/owner/repo",
          originalInput: "https://github.com/owner/repo.git",
        });
      }),
    );

    it.effect("resolves GitHub URL with tree ref and path", () =>
      Effect.gen(function* () {
        const result = yield* resolve("https://github.com/owner/repo/tree/main/skills/my-skill");

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: "skill",
          source: "github",
          origin: "https://github.com/owner/repo",
        });
        expect(Option.getOrNull(result[0]!.ref)).toBe("main");
        expect(Option.getOrNull(result[0]!.path)).toBe("skills/my-skill");
      }),
    );

    it.effect("resolves GitHub URL with just tree ref", () =>
      Effect.gen(function* () {
        const result = yield* resolve("https://github.com/owner/repo/tree/v1.0.0");

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: "skill",
          source: "github",
        });
        expect(Option.getOrNull(result[0]!.ref)).toBe("v1.0.0");
        expect(Option.isNone(result[0]!.path)).toBe(true);
      }),
    );
  });

  describe("GitLab HTTPS URLs", () => {
    it.effect("resolves https://gitlab.com/owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* resolve("https://gitlab.com/owner/repo");

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: "skill",
          source: "gitlab",
          origin: "https://gitlab.com/owner/repo",
          originalInput: "https://gitlab.com/owner/repo",
        });
      }),
    );

    it.effect("resolves GitLab URL with tree ref and path", () =>
      Effect.gen(function* () {
        const result = yield* resolve("https://gitlab.com/owner/repo/-/tree/develop/src/skills");

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: "skill",
          source: "gitlab",
          origin: "https://gitlab.com/owner/repo",
        });
        expect(Option.getOrNull(result[0]!.ref)).toBe("develop");
        expect(Option.getOrNull(result[0]!.path)).toBe("src/skills");
      }),
    );
  });

  describe("GitHub SSH URLs", () => {
    it.effect("resolves git@github.com:owner/repo.git", () =>
      Effect.gen(function* () {
        const result = yield* resolve("git@github.com:owner/repo.git");

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: "skill",
          source: "github",
          origin: "https://github.com/owner/repo",
          originalInput: "git@github.com:owner/repo.git",
        });
      }),
    );

    it.effect("resolves git@github.com:owner/repo (without .git)", () =>
      Effect.gen(function* () {
        const result = yield* resolve("git@github.com:owner/repo");

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: "skill",
          source: "github",
          origin: "https://github.com/owner/repo",
        });
      }),
    );
  });

  describe("GitLab SSH URLs", () => {
    it.effect("resolves git@gitlab.com:owner/repo.git", () =>
      Effect.gen(function* () {
        const result = yield* resolve("git@gitlab.com:owner/repo.git");

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: "skill",
          source: "gitlab",
          origin: "https://gitlab.com/owner/repo",
          originalInput: "git@gitlab.com:owner/repo.git",
        });
      }),
    );
  });

  describe("non-git URLs", () => {
    // Note: Non-git URLs are not supported. Only GitHub, GitLab, and Bitbucket
    // URLs are recognized. These tests verify the current behavior of returning empty arrays.

    it.effect("returns empty for URL with file extension (not a git host)", () =>
      Effect.gen(function* () {
        const result = yield* resolve("https://example.com/skills/my-skill.md");

        // Non-git URLs return empty - source type filtering removes them
        expect(result).toEqual([]);
      }),
    );

    it.effect("returns empty for URL without recognized git host", () =>
      Effect.gen(function* () {
        const result = yield* resolve("https://example.com");

        // Non-git URLs return empty - source type filtering removes them
        expect(result).toEqual([]);
      }),
    );

    it.effect("returns empty for URL with path but no recognized git host", () =>
      Effect.gen(function* () {
        const result = yield* resolve("https://example.com/some/path");

        // Non-git URLs return empty - source type filtering removes them
        expect(result).toEqual([]);
      }),
    );
  });

  describe("non-matching inputs", () => {
    it.effect("returns empty array for prefixed shorthand", () =>
      Effect.gen(function* () {
        const result = yield* resolve("github:owner/repo");

        expect(result).toEqual([]);
      }),
    );

    it.effect("returns empty array for unprefixed shorthand", () =>
      Effect.gen(function* () {
        const result = yield* resolve("owner/repo");

        expect(result).toEqual([]);
      }),
    );

    it.effect("returns empty array for local path", () =>
      Effect.gen(function* () {
        const result = yield* resolve("./local/path");

        expect(result).toEqual([]);
      }),
    );

    it.effect("returns empty array for absolute local path", () =>
      Effect.gen(function* () {
        const result = yield* resolve("/absolute/path");

        expect(result).toEqual([]);
      }),
    );

    it.effect("returns empty array for empty string", () =>
      Effect.gen(function* () {
        const result = yield* resolve("");

        expect(result).toEqual([]);
      }),
    );

    it.effect("returns empty array for whitespace-only string", () =>
      Effect.gen(function* () {
        const result = yield* resolve("   ");

        expect(result).toEqual([]);
      }),
    );

    it.effect("returns empty array for plain text", () =>
      Effect.gen(function* () {
        const result = yield* resolve("just-some-text");

        expect(result).toEqual([]);
      }),
    );
  });

  describe("edge cases", () => {
    it.effect("trims whitespace from input", () =>
      Effect.gen(function* () {
        const result = yield* resolve("  https://github.com/owner/repo  ");

        expect(result).toHaveLength(1);
        expect(result[0]?.source).toBe("github");
      }),
    );

    it.effect("preserves original input with whitespace", () =>
      Effect.gen(function* () {
        const result = yield* resolve("  https://github.com/owner/repo  ");

        expect(result[0]?.originalInput).toBe("  https://github.com/owner/repo  ");
      }),
    );

    it.effect("handles repos with dashes and dots", () =>
      Effect.gen(function* () {
        const result = yield* resolve("https://github.com/my-org/repo.js");

        expect(result).toHaveLength(1);
        expect(result[0]?.origin).toBe("https://github.com/my-org/repo.js");
      }),
    );

    it.effect("handles http:// URLs (not just https://)", () =>
      Effect.gen(function* () {
        const result = yield* resolve("http://github.com/owner/repo");

        expect(result).toHaveLength(1);
        expect(result[0]?.source).toBe("github");
      }),
    );
  });
});
