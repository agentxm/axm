/**
 * Unit tests for explicit-source resolver.
 *
 * Tests resolution of prefixed source strings (github:, gitlab:) to ExtensionRefs.
 */

import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { ResolutionOptions } from "../types.js";
import { resolveExplicitSource } from "./explicit-source.js";

const defaultOptions: ResolutionOptions = {};

describe("explicit-source resolver", () => {
  describe("github: prefix", () => {
    it.effect("resolves github:owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* resolveExplicitSource("github:owner/repo", defaultOptions);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: "skill",
          source: "github",
          origin: "https://github.com/owner/repo",
          originalInput: "github:owner/repo",
          metadata: {},
        });
        expect(result[0]?.ref).toBeUndefined();
        expect(result[0]?.path).toBeUndefined();
      }),
    );

    it.effect("resolves github:owner/repo@ref", () =>
      Effect.gen(function* () {
        const result = yield* resolveExplicitSource("github:owner/repo@v1.0.0", defaultOptions);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: "skill",
          source: "github",
          origin: "https://github.com/owner/repo",
          ref: "v1.0.0",
          originalInput: "github:owner/repo@v1.0.0",
        });
      }),
    );

    it.effect("resolves github:owner/repo/path", () =>
      Effect.gen(function* () {
        const result = yield* resolveExplicitSource(
          "github:owner/repo/skills/my-skill",
          defaultOptions,
        );

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: "skill",
          source: "github",
          origin: "https://github.com/owner/repo",
          path: "skills/my-skill",
          originalInput: "github:owner/repo/skills/my-skill",
        });
      }),
    );

    it.effect("resolves github:owner/repo/path@ref", () =>
      Effect.gen(function* () {
        const result = yield* resolveExplicitSource(
          "github:owner/repo/skills/my-skill@main",
          defaultOptions,
        );

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: "skill",
          source: "github",
          origin: "https://github.com/owner/repo",
          path: "skills/my-skill",
          ref: "main",
          originalInput: "github:owner/repo/skills/my-skill@main",
        });
      }),
    );
  });

  describe("gitlab: prefix", () => {
    it.effect("resolves gitlab:owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* resolveExplicitSource("gitlab:owner/repo", defaultOptions);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: "skill",
          source: "gitlab",
          origin: "https://gitlab.com/owner/repo",
          originalInput: "gitlab:owner/repo",
          metadata: {},
        });
      }),
    );

    it.effect("resolves gitlab:owner/repo@ref", () =>
      Effect.gen(function* () {
        const result = yield* resolveExplicitSource("gitlab:owner/repo@develop", defaultOptions);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: "skill",
          source: "gitlab",
          origin: "https://gitlab.com/owner/repo",
          ref: "develop",
          originalInput: "gitlab:owner/repo@develop",
        });
      }),
    );

    it.effect("resolves gitlab:owner/repo/path@ref", () =>
      Effect.gen(function* () {
        const result = yield* resolveExplicitSource(
          "gitlab:owner/repo/skills/test@v2.0.0",
          defaultOptions,
        );

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: "skill",
          source: "gitlab",
          origin: "https://gitlab.com/owner/repo",
          path: "skills/test",
          ref: "v2.0.0",
        });
      }),
    );
  });

  describe("non-matching inputs", () => {
    it.effect("returns empty array for unprefixed shorthand", () =>
      Effect.gen(function* () {
        const result = yield* resolveExplicitSource("owner/repo", defaultOptions);

        expect(result).toEqual([]);
      }),
    );

    it.effect("returns empty array for GitHub HTTPS URL", () =>
      Effect.gen(function* () {
        const result = yield* resolveExplicitSource(
          "https://github.com/owner/repo",
          defaultOptions,
        );

        expect(result).toEqual([]);
      }),
    );

    it.effect("returns empty array for local path", () =>
      Effect.gen(function* () {
        const result = yield* resolveExplicitSource("./local/path", defaultOptions);

        expect(result).toEqual([]);
      }),
    );

    it.effect("returns empty array for empty string", () =>
      Effect.gen(function* () {
        const result = yield* resolveExplicitSource("", defaultOptions);

        expect(result).toEqual([]);
      }),
    );

    it.effect("returns empty array for whitespace-only string", () =>
      Effect.gen(function* () {
        const result = yield* resolveExplicitSource("   ", defaultOptions);

        expect(result).toEqual([]);
      }),
    );

    it.effect("returns empty array for unknown prefix", () =>
      Effect.gen(function* () {
        const result = yield* resolveExplicitSource("unknown:owner/repo", defaultOptions);

        expect(result).toEqual([]);
      }),
    );
  });

  describe("edge cases", () => {
    it.effect("trims whitespace from input", () =>
      Effect.gen(function* () {
        const result = yield* resolveExplicitSource("  github:owner/repo  ", defaultOptions);

        expect(result).toHaveLength(1);
        expect(result[0]?.source).toBe("github");
      }),
    );

    it.effect("handles repos with dashes and dots", () =>
      Effect.gen(function* () {
        const result = yield* resolveExplicitSource("github:my-org/repo.js", defaultOptions);

        expect(result).toHaveLength(1);
        expect(result[0]?.origin).toBe("https://github.com/my-org/repo.js");
      }),
    );

    it.effect("preserves original input with whitespace", () =>
      Effect.gen(function* () {
        const result = yield* resolveExplicitSource("  github:owner/repo  ", defaultOptions);

        expect(result[0]?.originalInput).toBe("  github:owner/repo  ");
      }),
    );

    it.effect("returns empty array for bitbucket: (not yet implemented in parser)", () =>
      Effect.gen(function* () {
        // bitbucket: prefix is recognized but parser doesn't support it yet
        const result = yield* resolveExplicitSource("bitbucket:owner/repo", defaultOptions);

        expect(result).toEqual([]);
      }),
    );

    it.effect("returns empty array for azure: (not yet implemented in parser)", () =>
      Effect.gen(function* () {
        // azure: prefix is recognized but parser doesn't support it yet
        const result = yield* resolveExplicitSource("azure:owner/repo", defaultOptions);

        expect(result).toEqual([]);
      }),
    );
  });
});
