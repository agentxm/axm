/**
 * Unit tests for skills command utilities.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { ExtensionRef } from "../../resolution/index.js";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { CliError } from "../../cli-error/index.js";
import { makeSelectTestLayer } from "../../tui/index.js";
import { selectExtensionRef } from "./utils.js";

/** Narrow a flipped error to CliError, failing the test if it's not. */
const expectCliError = (error: CliError | { readonly _tag: string }): CliError => {
  expect(error._tag).toBe("CliError");
  return error as CliError;
};

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
    it.effect("fails with CliError when refs array is empty", () =>
      Effect.gen(function* () {
        const raw = yield* selectExtensionRef([], "my-skill", false).pipe(Effect.flip);
        const error = expectCliError(raw);

        expect(error.code).toBe("SKILLS_OPERATION_FAILED");
        expect(error.what).toContain('Could not resolve "my-skill"');
      }).pipe(Effect.provide(SelectTestLayer)),
    );

    it.effect("includes format suggestions in error message", () =>
      Effect.gen(function* () {
        const raw = yield* selectExtensionRef([], "invalid-input", false).pipe(Effect.flip);
        const error = expectCliError(raw);

        expect(error.what).toContain("No matching extensions found");
        expect(error.what).toContain("Try one of these formats:");
        expect(error.what).toContain("Local path:");
        expect(error.what).toContain("GitHub:");
        expect(error.what).toContain("GitLab:");
      }).pipe(Effect.provide(SelectTestLayer)),
    );

    it.effect("uses formatEmptyResolutionError (has X marker)", () =>
      Effect.gen(function* () {
        const raw = yield* selectExtensionRef([], "test", false).pipe(Effect.flip);
        const error = expectCliError(raw);

        expect(error.what).toMatch(/^✗/);
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
    it.effect("fails with CliError when canPrompt is false", () =>
      Effect.gen(function* () {
        const refs = [
          createRef({ origin: "https://github.com/owner1/repo", source: "github" }),
          createRef({ origin: "https://gitlab.com/owner2/repo", source: "gitlab" }),
        ];

        const raw = yield* selectExtensionRef(refs, "repo", false).pipe(Effect.flip);
        const error = expectCliError(raw);

        expect(error.code).toBe("SKILLS_OPERATION_FAILED");
      }).pipe(Effect.provide(SelectTestLayer)),
    );

    it.effect("error message mentions ambiguous input", () =>
      Effect.gen(function* () {
        const refs = [
          createRef({ origin: "https://github.com/owner1/repo" }),
          createRef({ origin: "https://github.com/owner2/repo" }),
        ];

        const raw = yield* selectExtensionRef(refs, "my-input", false).pipe(Effect.flip);
        const error = expectCliError(raw);

        expect(error.what).toContain('Ambiguous input "my-input"');
        expect(error.what).toContain("matches multiple sources");
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

        const raw = yield* selectExtensionRef(refs, "skill", false).pipe(Effect.flip);
        const error = expectCliError(raw);

        expect(error.what).toContain("Found 2 matches:");
        expect(error.what).toContain("@scope/skill-a (github)");
        expect(error.what).toContain("@scope/skill-b (gitlab)");
      }).pipe(Effect.provide(SelectTestLayer)),
    );

    it.effect("error message uses origin when name is not available", () =>
      Effect.gen(function* () {
        const refs = [
          createRef({ origin: "https://github.com/owner/repo", source: "github" }),
          createRef({ origin: "/local/path/to/skills", source: "git" }),
        ];

        const raw = yield* selectExtensionRef(refs, "skills", false).pipe(Effect.flip);
        const error = expectCliError(raw);

        expect(error.what).toContain("https://github.com/owner/repo (github)");
        expect(error.what).toContain("/local/path/to/skills (git)");
      }).pipe(Effect.provide(SelectTestLayer)),
    );

    it.effect("error message includes recovery guidance", () =>
      Effect.gen(function* () {
        const refs = [createRef(), createRef()];

        const raw = yield* selectExtensionRef(refs, "test", false).pipe(Effect.flip);
        const error = expectCliError(raw);

        expect(error.what).toContain("--yes");
        expect(error.what).toContain("--non-interactive");
        expect(error.what).toContain("more specific source identifier");
      }).pipe(Effect.provide(SelectTestLayer)),
    );
  });

  describe("CliError from selectExtensionRef", () => {
    it.effect("produces CliError with correct code", () =>
      Effect.gen(function* () {
        const raw = yield* selectExtensionRef([], "test", false).pipe(Effect.flip);
        const error = expectCliError(raw);

        expect(error).toBeInstanceOf(CliError);
        expect(error.code).toBe("SKILLS_OPERATION_FAILED");
      }).pipe(Effect.provide(SelectTestLayer)),
    );
  });
});
