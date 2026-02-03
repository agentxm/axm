/**
 * Unit tests for skills command utilities.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { ExtensionRef } from "@agentxm/core/experimental/resolution";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { SkillsError, selectExtensionRef } from "./utils.js";

describe("selectExtensionRef", () => {
  // Helper to create test ExtensionRef objects
  const createRef = (overrides: Partial<ExtensionRef> = {}): ExtensionRef => ({
    type: "skill",
    source: "github",
    origin: "https://github.com/test/repo",
    originalInput: "test/repo",
    metadata: {},
    ...overrides,
  });

  describe("empty results", () => {
    it.effect("fails with SkillsError when refs array is empty", () =>
      Effect.gen(function* () {
        const error = yield* selectExtensionRef([], "my-skill", false).pipe(Effect.flip);

        expect(error._tag).toBe("SkillsError");
        expect(error.message).toContain('Could not resolve "my-skill"');
        expect(error.retryable).toBe(false);
      }),
    );

    it.effect("includes format suggestions in error message", () =>
      Effect.gen(function* () {
        const error = yield* selectExtensionRef([], "invalid-input", false).pipe(Effect.flip);

        expect(error.message).toContain("No matching extensions found");
        expect(error.message).toContain("Try one of these formats:");
        expect(error.message).toContain("Local path:");
        expect(error.message).toContain("GitHub:");
        expect(error.message).toContain("GitLab:");
      }),
    );

    it.effect("uses formatEmptyResolutionError (has X marker)", () =>
      Effect.gen(function* () {
        const error = yield* selectExtensionRef([], "test", false).pipe(Effect.flip);

        expect(error.message).toMatch(/^✗/);
      }),
    );
  });

  describe("single result", () => {
    it.effect("returns the single ref directly", () =>
      Effect.gen(function* () {
        const ref = createRef({ origin: "https://github.com/owner/repo" });

        const result = yield* selectExtensionRef([ref], "owner/repo", false);

        expect(result).toBe(ref);
      }),
    );

    it.effect("works regardless of canPrompt value", () =>
      Effect.gen(function* () {
        const ref = createRef({ name: "@scope/skill" });

        // Should work with canPrompt = true
        const result1 = yield* selectExtensionRef([ref], "skill", true);
        expect(result1).toBe(ref);

        // Should work with canPrompt = false
        const result2 = yield* selectExtensionRef([ref], "skill", false);
        expect(result2).toBe(ref);
      }),
    );

    it.effect("preserves all ref properties", () =>
      Effect.gen(function* () {
        const ref = createRef({
          type: "skill",
          source: "github",
          origin: "https://github.com/org/repo",
          ref: "v1.0.0",
          name: "@org/my-skill",
          path: "skills/my-skill",
          originalInput: "github:org/repo/skills/my-skill@v1.0.0",
          metadata: { description: "A test skill" },
        });

        const result = yield* selectExtensionRef([ref], "org/repo", false);

        expect(result.type).toBe("skill");
        expect(result.source).toBe("github");
        expect(result.origin).toBe("https://github.com/org/repo");
        expect(result.ref).toBe("v1.0.0");
        expect(result.name).toBe("@org/my-skill");
        expect(result.path).toBe("skills/my-skill");
        expect(result.metadata.description).toBe("A test skill");
      }),
    );
  });

  describe("multiple results (non-interactive)", () => {
    it.effect("fails with SkillsError when canPrompt is false", () =>
      Effect.gen(function* () {
        const refs = [
          createRef({ origin: "https://github.com/owner1/repo", source: "github" }),
          createRef({ origin: "https://gitlab.com/owner2/repo", source: "gitlab" }),
        ];

        const error = yield* selectExtensionRef(refs, "repo", false).pipe(Effect.flip);

        expect(error._tag).toBe("SkillsError");
        expect(error.retryable).toBe(false);
      }),
    );

    it.effect("error message mentions ambiguous input", () =>
      Effect.gen(function* () {
        const refs = [
          createRef({ origin: "https://github.com/owner1/repo" }),
          createRef({ origin: "https://github.com/owner2/repo" }),
        ];

        const error = yield* selectExtensionRef(refs, "my-input", false).pipe(Effect.flip);

        expect(error.message).toContain('Ambiguous input "my-input"');
        expect(error.message).toContain("matches multiple sources");
      }),
    );

    it.effect("error message lists all matches", () =>
      Effect.gen(function* () {
        const refs = [
          createRef({
            name: "@scope/skill-a",
            origin: "https://github.com/org/a",
            source: "github",
          }),
          createRef({
            name: "@scope/skill-b",
            origin: "https://gitlab.com/org/b",
            source: "gitlab",
          }),
        ];

        const error = yield* selectExtensionRef(refs, "skill", false).pipe(Effect.flip);

        expect(error.message).toContain("Found 2 matches:");
        expect(error.message).toContain("@scope/skill-a (github)");
        expect(error.message).toContain("@scope/skill-b (gitlab)");
      }),
    );

    it.effect("error message uses origin when name is not available", () =>
      Effect.gen(function* () {
        const refs = [
          createRef({ origin: "https://github.com/owner/repo", source: "github" }),
          createRef({ origin: "/local/path/to/skills", source: "path" }),
        ];

        const error = yield* selectExtensionRef(refs, "skills", false).pipe(Effect.flip);

        expect(error.message).toContain("https://github.com/owner/repo (github)");
        expect(error.message).toContain("/local/path/to/skills (path)");
      }),
    );

    it.effect("error message includes recovery guidance", () =>
      Effect.gen(function* () {
        const refs = [createRef(), createRef()];

        const error = yield* selectExtensionRef(refs, "test", false).pipe(Effect.flip);

        expect(error.message).toContain("--yes");
        expect(error.message).toContain("--non-interactive");
        expect(error.message).toContain("more specific source identifier");
      }),
    );
  });

  describe("SkillsError", () => {
    it("is a tagged error with correct tag", () => {
      const error = new SkillsError({
        message: "Test error message",
        retryable: false,
      });

      expect(error._tag).toBe("SkillsError");
      expect(error.message).toBe("Test error message");
    });

    it("can indicate retryable errors", () => {
      const retryable = new SkillsError({
        message: "Network error",
        retryable: true,
      });

      const nonRetryable = new SkillsError({
        message: "Invalid input",
        retryable: false,
      });

      expect(retryable.retryable).toBe(true);
      expect(nonRetryable.retryable).toBe(false);
    });
  });
});
