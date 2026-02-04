/**
 * Unit tests for URL resolver.
 *
 * Tests resolution of URL-like inputs (GitHub/GitLab HTTPS, SSH, and other URLs) to ExtensionRefs.
 */

import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { ResolutionOptions } from "../types.js";
import { resolveUrl } from "./url.js";

const defaultOptions: ResolutionOptions = {};

describe("url resolver", () => {
  describe("GitHub HTTPS URLs", () => {
    it.effect("resolves https://github.com/owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* resolveUrl("https://github.com/owner/repo", defaultOptions);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: "skill",
          source: "github",
          origin: "https://github.com/owner/repo",
          originalInput: "https://github.com/owner/repo",
          metadata: {},
        });
        expect(result[0]?.ref).toBeUndefined();
        expect(result[0]?.path).toBeUndefined();
      }),
    );

    it.effect("resolves https://github.com/owner/repo.git", () =>
      Effect.gen(function* () {
        const result = yield* resolveUrl("https://github.com/owner/repo.git", defaultOptions);

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
        const result = yield* resolveUrl(
          "https://github.com/owner/repo/tree/main/skills/my-skill",
          defaultOptions,
        );

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: "skill",
          source: "github",
          origin: "https://github.com/owner/repo",
          ref: "main",
          path: "skills/my-skill",
        });
      }),
    );

    it.effect("resolves GitHub URL with just tree ref", () =>
      Effect.gen(function* () {
        const result = yield* resolveUrl(
          "https://github.com/owner/repo/tree/v1.0.0",
          defaultOptions,
        );

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: "skill",
          source: "github",
          ref: "v1.0.0",
        });
        expect(result[0]?.path).toBeUndefined();
      }),
    );
  });

  describe("GitLab HTTPS URLs", () => {
    it.effect("resolves https://gitlab.com/owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* resolveUrl("https://gitlab.com/owner/repo", defaultOptions);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: "skill",
          source: "gitlab",
          origin: "https://gitlab.com/owner/repo",
          originalInput: "https://gitlab.com/owner/repo",
          metadata: {},
        });
      }),
    );

    it.effect("resolves GitLab URL with tree ref and path", () =>
      Effect.gen(function* () {
        const result = yield* resolveUrl(
          "https://gitlab.com/owner/repo/-/tree/develop/src/skills",
          defaultOptions,
        );

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: "skill",
          source: "gitlab",
          origin: "https://gitlab.com/owner/repo",
          ref: "develop",
          path: "src/skills",
        });
      }),
    );
  });

  describe("GitHub SSH URLs", () => {
    it.effect("resolves git@github.com:owner/repo.git", () =>
      Effect.gen(function* () {
        const result = yield* resolveUrl("git@github.com:owner/repo.git", defaultOptions);

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
        const result = yield* resolveUrl("git@github.com:owner/repo", defaultOptions);

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
        const result = yield* resolveUrl("git@gitlab.com:owner/repo.git", defaultOptions);

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
    // Note: Non-git URLs (direct files, well-known endpoints) are not currently
    // supported by the resolution pipeline as their source types are not in SourceType.
    // These tests verify the current behavior of returning empty arrays.

    it.effect("returns empty for URL with file extension (not a git host)", () =>
      Effect.gen(function* () {
        const result = yield* resolveUrl("https://example.com/skills/my-skill.md", defaultOptions);

        // Non-git URLs return empty - source type filtering removes them
        expect(result).toEqual([]);
      }),
    );

    it.effect("returns empty for URL without recognized git host", () =>
      Effect.gen(function* () {
        const result = yield* resolveUrl("https://example.com", defaultOptions);

        // Non-git URLs return empty - source type filtering removes them
        expect(result).toEqual([]);
      }),
    );

    it.effect("returns empty for URL with path but no recognized git host", () =>
      Effect.gen(function* () {
        const result = yield* resolveUrl("https://example.com/some/path", defaultOptions);

        // Non-git URLs return empty - source type filtering removes them
        expect(result).toEqual([]);
      }),
    );
  });

  describe("non-matching inputs", () => {
    it.effect("returns empty array for prefixed shorthand", () =>
      Effect.gen(function* () {
        const result = yield* resolveUrl("github:owner/repo", defaultOptions);

        expect(result).toEqual([]);
      }),
    );

    it.effect("returns empty array for unprefixed shorthand", () =>
      Effect.gen(function* () {
        const result = yield* resolveUrl("owner/repo", defaultOptions);

        expect(result).toEqual([]);
      }),
    );

    it.effect("returns empty array for local path", () =>
      Effect.gen(function* () {
        const result = yield* resolveUrl("./local/path", defaultOptions);

        expect(result).toEqual([]);
      }),
    );

    it.effect("returns empty array for absolute local path", () =>
      Effect.gen(function* () {
        const result = yield* resolveUrl("/absolute/path", defaultOptions);

        expect(result).toEqual([]);
      }),
    );

    it.effect("returns empty array for empty string", () =>
      Effect.gen(function* () {
        const result = yield* resolveUrl("", defaultOptions);

        expect(result).toEqual([]);
      }),
    );

    it.effect("returns empty array for whitespace-only string", () =>
      Effect.gen(function* () {
        const result = yield* resolveUrl("   ", defaultOptions);

        expect(result).toEqual([]);
      }),
    );

    it.effect("returns empty array for plain text", () =>
      Effect.gen(function* () {
        const result = yield* resolveUrl("just-some-text", defaultOptions);

        expect(result).toEqual([]);
      }),
    );
  });

  describe("edge cases", () => {
    it.effect("trims whitespace from input", () =>
      Effect.gen(function* () {
        const result = yield* resolveUrl("  https://github.com/owner/repo  ", defaultOptions);

        expect(result).toHaveLength(1);
        expect(result[0]?.source).toBe("github");
      }),
    );

    it.effect("preserves original input with whitespace", () =>
      Effect.gen(function* () {
        const result = yield* resolveUrl("  https://github.com/owner/repo  ", defaultOptions);

        expect(result[0]?.originalInput).toBe("  https://github.com/owner/repo  ");
      }),
    );

    it.effect("handles repos with dashes and dots", () =>
      Effect.gen(function* () {
        const result = yield* resolveUrl("https://github.com/my-org/repo.js", defaultOptions);

        expect(result).toHaveLength(1);
        expect(result[0]?.origin).toBe("https://github.com/my-org/repo.js");
      }),
    );

    it.effect("handles http:// URLs (not just https://)", () =>
      Effect.gen(function* () {
        const result = yield* resolveUrl("http://github.com/owner/repo", defaultOptions);

        expect(result).toHaveLength(1);
        expect(result[0]?.source).toBe("github");
      }),
    );
  });
});
