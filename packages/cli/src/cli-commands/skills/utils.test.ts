/**
 * Unit tests for skills command utilities.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { ExtensionRef } from "../../resolution/index.js";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeSelectTestLayer } from "../../tui/index.js";
import { SkillsError, selectExtensionRef } from "./utils.js";

describe("selectExtensionRef", () => {
  // Create a test layer for Select - tests don't actually prompt since canPrompt=false
  const [SelectTestLayer] = makeSelectTestLayer();

  // Helper to create test ExtensionRef objects
  const createRef = (overrides: Partial<ExtensionRef> = {}): ExtensionRef => ({
    type: "skill",
    source: "github",
    origin: "https://github.com/test/repo",
    ref: Option.none(),
    name: Option.none(),
    path: Option.none(),
    originalInput: "test/repo",
    metadata: {
      version: Option.none(),
      description: Option.none(),
      files: Option.none(),
      versionConstraint: Option.none(),
    },
    ...overrides,
  });

  describe("empty results", () => {
    it.effect("fails with SkillsError when refs array is empty", () =>
      Effect.gen(function* () {
        const error = yield* selectExtensionRef([], "my-skill", false).pipe(Effect.flip);

        expect(error._tag).toBe("SkillsError");
        expect(error.message).toContain('Could not resolve "my-skill"');
        expect(error.retryable).toBe(false);
      }).pipe(Effect.provide(SelectTestLayer)),
    );

    it.effect("includes format suggestions in error message", () =>
      Effect.gen(function* () {
        const error = yield* selectExtensionRef([], "invalid-input", false).pipe(Effect.flip);

        expect(error.message).toContain("No matching extensions found");
        expect(error.message).toContain("Try one of these formats:");
        expect(error.message).toContain("Local path:");
        expect(error.message).toContain("GitHub:");
        expect(error.message).toContain("GitLab:");
      }).pipe(Effect.provide(SelectTestLayer)),
    );

    it.effect("uses formatEmptyResolutionError (has X marker)", () =>
      Effect.gen(function* () {
        const error = yield* selectExtensionRef([], "test", false).pipe(Effect.flip);

        expect(error.message).toMatch(/^✗/);
      }).pipe(Effect.provide(SelectTestLayer)),
    );
  });

  describe("single result", () => {
    it.effect("returns the single ref directly", () =>
      Effect.gen(function* () {
        const ref = createRef({ origin: "https://github.com/owner/repo" });

        const result = yield* selectExtensionRef([ref], "owner/repo", false);

        expect(result).toBe(ref);
      }).pipe(Effect.provide(SelectTestLayer)),
    );

    it.effect("works regardless of canPrompt value", () =>
      Effect.gen(function* () {
        const ref = createRef({ name: Option.some("@scope/skill") });

        // Should work with canPrompt = true
        const result1 = yield* selectExtensionRef([ref], "skill", true);
        expect(result1).toBe(ref);

        // Should work with canPrompt = false
        const result2 = yield* selectExtensionRef([ref], "skill", false);
        expect(result2).toBe(ref);
      }).pipe(Effect.provide(SelectTestLayer)),
    );

    it.effect("preserves all ref properties", () =>
      Effect.gen(function* () {
        const ref = createRef({
          type: "skill",
          source: "github",
          origin: "https://github.com/org/repo",
          ref: Option.some("v1.0.0"),
          name: Option.some("@org/my-skill"),
          path: Option.some("skills/my-skill"),
          originalInput: "github:org/repo/skills/my-skill@v1.0.0",
          metadata: {
            version: Option.none(),
            description: Option.some("A test skill"),
            files: Option.none(),
            versionConstraint: Option.none(),
          },
        });

        const result = yield* selectExtensionRef([ref], "org/repo", false);

        expect(result.type).toBe("skill");
        expect(result.source).toBe("github");
        expect(result.origin).toBe("https://github.com/org/repo");
        expect(Option.getOrNull(result.ref)).toBe("v1.0.0");
        expect(Option.getOrNull(result.name)).toBe("@org/my-skill");
        expect(Option.getOrNull(result.path)).toBe("skills/my-skill");
        expect(Option.getOrNull(result.metadata.description)).toBe("A test skill");
      }).pipe(Effect.provide(SelectTestLayer)),
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
      }).pipe(Effect.provide(SelectTestLayer)),
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
      }).pipe(Effect.provide(SelectTestLayer)),
    );

    it.effect("error message lists all matches", () =>
      Effect.gen(function* () {
        const refs = [
          createRef({
            name: Option.some("@scope/skill-a"),
            origin: "https://github.com/org/a",
            source: "github",
          }),
          createRef({
            name: Option.some("@scope/skill-b"),
            origin: "https://gitlab.com/org/b",
            source: "gitlab",
          }),
        ];

        const error = yield* selectExtensionRef(refs, "skill", false).pipe(Effect.flip);

        expect(error.message).toContain("Found 2 matches:");
        expect(error.message).toContain("@scope/skill-a (github)");
        expect(error.message).toContain("@scope/skill-b (gitlab)");
      }).pipe(Effect.provide(SelectTestLayer)),
    );

    it.effect("error message uses origin when name is not available", () =>
      Effect.gen(function* () {
        const refs = [
          createRef({ origin: "https://github.com/owner/repo", source: "github" }),
          createRef({ origin: "/local/path/to/skills", source: "git" }),
        ];

        const error = yield* selectExtensionRef(refs, "skills", false).pipe(Effect.flip);

        expect(error.message).toContain("https://github.com/owner/repo (github)");
        expect(error.message).toContain("/local/path/to/skills (git)");
      }).pipe(Effect.provide(SelectTestLayer)),
    );

    it.effect("error message includes recovery guidance", () =>
      Effect.gen(function* () {
        const refs = [createRef(), createRef()];

        const error = yield* selectExtensionRef(refs, "test", false).pipe(Effect.flip);

        expect(error.message).toContain("--yes");
        expect(error.message).toContain("--non-interactive");
        expect(error.message).toContain("more specific source identifier");
      }).pipe(Effect.provide(SelectTestLayer)),
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
