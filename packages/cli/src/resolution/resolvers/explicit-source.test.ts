/**
 * Unit tests for explicit-source resolver.
 *
 * Tests resolution of prefixed source strings (github:, gitlab:) to ExtensionRefs.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { LockfileService } from "../../lockfile/index.js";
import { resolveExplicitSource } from "./explicit-source.js";

/** Empty lockfile layer — resolveExplicitSource never hits the NameInput branch. */
const EmptyLockfileLayer = Layer.succeed(LockfileService, {
  getSkills: () => Effect.succeed({}),
  getEntry: () => Effect.succeed(Option.none()),
  updateEntry: () => Effect.void,
  removeEntry: () => Effect.void,
});

/** Wrap resolveExplicitSource with the empty lockfile layer. */
const resolve = (input: string) =>
  resolveExplicitSource(input).pipe(Effect.provide(EmptyLockfileLayer));

describe("explicit-source resolver", () => {
  describe("github: prefix", () => {
    it.effect("resolves github:owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* resolve("github:owner/repo");

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: "skill",
          source: "github",
          origin: "https://github.com/owner/repo",
          originalInput: "github:owner/repo",
        });
        expect(Option.isNone(result[0]!.ref)).toBe(true);
        expect(Option.isNone(result[0]!.path)).toBe(true);
      }),
    );

    it.effect("resolves github:owner/repo@ref", () =>
      Effect.gen(function* () {
        const result = yield* resolve("github:owner/repo@v1.0.0");

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: "skill",
          source: "github",
          origin: "https://github.com/owner/repo",
          originalInput: "github:owner/repo@v1.0.0",
        });
        expect(Option.getOrNull(result[0]!.ref)).toBe("v1.0.0");
      }),
    );

    it.effect("resolves github:owner/repo/path", () =>
      Effect.gen(function* () {
        const result = yield* resolve("github:owner/repo/skills/my-skill");

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: "skill",
          source: "github",
          origin: "https://github.com/owner/repo",
          originalInput: "github:owner/repo/skills/my-skill",
        });
        expect(Option.getOrNull(result[0]!.path)).toBe("skills/my-skill");
      }),
    );

    it.effect("resolves github:owner/repo/path@ref", () =>
      Effect.gen(function* () {
        const result = yield* resolve("github:owner/repo/skills/my-skill@main");

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: "skill",
          source: "github",
          origin: "https://github.com/owner/repo",
          originalInput: "github:owner/repo/skills/my-skill@main",
        });
        expect(Option.getOrNull(result[0]!.path)).toBe("skills/my-skill");
        expect(Option.getOrNull(result[0]!.ref)).toBe("main");
      }),
    );
  });

  describe("gitlab: prefix", () => {
    it.effect("resolves gitlab:owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* resolve("gitlab:owner/repo");

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: "skill",
          source: "gitlab",
          origin: "https://gitlab.com/owner/repo",
          originalInput: "gitlab:owner/repo",
        });
      }),
    );

    it.effect("resolves gitlab:owner/repo@ref", () =>
      Effect.gen(function* () {
        const result = yield* resolve("gitlab:owner/repo@develop");

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: "skill",
          source: "gitlab",
          origin: "https://gitlab.com/owner/repo",
          originalInput: "gitlab:owner/repo@develop",
        });
        expect(Option.getOrNull(result[0]!.ref)).toBe("develop");
      }),
    );

    it.effect("resolves gitlab:owner/repo/path@ref", () =>
      Effect.gen(function* () {
        const result = yield* resolve("gitlab:owner/repo/skills/test@v2.0.0");

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: "skill",
          source: "gitlab",
          origin: "https://gitlab.com/owner/repo",
        });
        expect(Option.getOrNull(result[0]!.path)).toBe("skills/test");
        expect(Option.getOrNull(result[0]!.ref)).toBe("v2.0.0");
      }),
    );
  });

  describe("non-matching inputs", () => {
    it.effect("returns empty array for unprefixed shorthand", () =>
      Effect.gen(function* () {
        const result = yield* resolve("owner/repo");

        expect(result).toEqual([]);
      }),
    );

    it.effect("returns empty array for GitHub HTTPS URL", () =>
      Effect.gen(function* () {
        const result = yield* resolve("https://github.com/owner/repo");

        expect(result).toEqual([]);
      }),
    );

    it.effect("returns empty array for local path", () =>
      Effect.gen(function* () {
        const result = yield* resolve("./local/path");

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

    it.effect("returns empty array for unknown prefix", () =>
      Effect.gen(function* () {
        const result = yield* resolve("unknown:owner/repo");

        expect(result).toEqual([]);
      }),
    );
  });

  describe("edge cases", () => {
    it.effect("trims whitespace from input", () =>
      Effect.gen(function* () {
        const result = yield* resolve("  github:owner/repo  ");

        expect(result).toHaveLength(1);
        expect(result[0]?.source).toBe("github");
      }),
    );

    it.effect("handles repos with dashes and dots", () =>
      Effect.gen(function* () {
        const result = yield* resolve("github:my-org/repo.js");

        expect(result).toHaveLength(1);
        expect(result[0]?.origin).toBe("https://github.com/my-org/repo.js");
      }),
    );

    it.effect("preserves original input with whitespace", () =>
      Effect.gen(function* () {
        const result = yield* resolve("  github:owner/repo  ");

        expect(result[0]?.originalInput).toBe("  github:owner/repo  ");
      }),
    );

    it.effect("returns empty array for bitbucket: (not yet implemented in parser)", () =>
      Effect.gen(function* () {
        // bitbucket: prefix is recognized but parser doesn't support it yet
        const result = yield* resolve("bitbucket:owner/repo");

        expect(result).toEqual([]);
      }),
    );

    it.effect("returns empty array for azure: (not yet implemented in parser)", () =>
      Effect.gen(function* () {
        // azure: prefix is recognized but parser doesn't support it yet
        const result = yield* resolve("azure:owner/repo");

        expect(result).toEqual([]);
      }),
    );
  });
});
