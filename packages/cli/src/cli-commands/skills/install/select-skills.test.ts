/**
 * Unit tests for determineSkillsToInstall.
 *
 * Tests the skill selection logic given already-discovered skills.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { TestRenderer } from "@axm.sh/core/unstable/cli-renderer"; import { OutputAdapter } from "@axm.sh/core/unstable/output";
import { makeTestPrompt } from "@axm.sh/core/unstable/cli-prompt"; import { InputAdapter } from "@axm.sh/core/unstable/input";
import { CliEnvironmentTest } from "@axm.sh/core/unstable/cli-flags";
import type { SkillExtensionRef } from "@axm.sh/core/unstable/sources";
import { AppError } from "@axm.sh/core/unstable/app-error";
import { determineSkillsToInstall } from "./select-skills.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeSkill = (name: string): SkillExtensionRef => ({
  type: "skill",
  refType: "local",
  skill: { name, description: Option.none(), metadata: Option.none() },
  source: { type: "local", path: `/fake/${name}` },
  location: `file:///fake/${name}`,
});

const { layer: rendererLayer } = TestRenderer.make();
const [inputLayer] = makeTestPrompt({
  methodBehaviors: { multiselect: { type: "multiselect", indices: [0, 1] } },
});
const TestLayer = Layer.mergeAll(rendererLayer, OutputAdapter.pipe(Layer.provide(rendererLayer)), promptLayer, InputAdapter.pipe(Layer.provide(promptLayer)), CliEnvironmentTest());

type TestR = Layer.Success<typeof TestLayer>;

const provide = <A, E>(effect: Effect.Effect<A, E, TestR>) =>
  effect.pipe(Effect.provide(TestLayer));

const provideWithFlags = (overrides: Parameters<typeof CliEnvironmentTest>[0]) => {
  const layer = Layer.mergeAll(rendererLayer, OutputAdapter.pipe(Layer.provide(rendererLayer)), promptLayer, InputAdapter.pipe(Layer.provide(promptLayer)), CliEnvironmentTest(overrides));
  return <A, E>(effect: Effect.Effect<A, E, TestR>) => effect.pipe(Effect.provide(layer));
};

/** Helper to create a NonEmptyReadonlyArray of skills. */
const skills = (...names: [string, ...string[]]): Array.NonEmptyReadonlyArray<SkillExtensionRef> =>
  names.map((n) => makeSkill(n)) as unknown as Array.NonEmptyReadonlyArray<SkillExtensionRef>;

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("determineSkillsToInstall", () => {
  describe("--skill flag (rule 1)", () => {
    it.effect("returns matching skills when all names are valid", () =>
      provide(
        Effect.gen(function* () {
          const result = yield* determineSkillsToInstall(skills("commit", "review-pr", "debug"), {
            requestedSkills: ["commit", "debug"],
            all: false,
          });

          expect(result.map((s) => s.skill.name)).toEqual(["commit", "debug"]);
        }),
      ),
    );

    it.effect("ignores unmatched patterns when other patterns match", () =>
      provide(
        Effect.gen(function* () {
          const result = yield* determineSkillsToInstall(skills("commit"), {
            requestedSkills: ["commit", "nonexistent"],
            all: false,
          });

          expect(result.map((s) => s.skill.name)).toEqual(["commit"]);
        }),
      ),
    );

    it.effect("errors when no requested patterns match any skill", () =>
      provide(
        Effect.gen(function* () {
          const error = yield* determineSkillsToInstall(skills("commit"), {
            requestedSkills: ["foo", "bar"],
            all: false,
          }).pipe(Effect.flip);

          expect(error._tag).toBe("AppError");
          expect((error as AppError).what).toContain("No skills matched");
        }),
      ),
    );

    it.effect("filters skills using a glob pattern", () =>
      provide(
        Effect.gen(function* () {
          const result = yield* determineSkillsToInstall(
            skills("effect-basics", "effect-stream", "testing-unit"),
            {
              requestedSkills: ["effect-*"],
              all: false,
            },
          );

          expect(result.map((s) => s.skill.name)).toEqual(["effect-basics", "effect-stream"]);
        }),
      ),
    );

    it.effect("combines matches from multiple glob patterns", () =>
      provide(
        Effect.gen(function* () {
          const result = yield* determineSkillsToInstall(
            skills("effect-basics", "effect-stream", "testing-unit", "commit"),
            {
              requestedSkills: ["effect-*", "commit"],
              all: false,
            },
          );

          expect(result.map((s) => s.skill.name)).toEqual([
            "effect-basics",
            "effect-stream",
            "commit",
          ]);
        }),
      ),
    );

    it.effect("supports exact name and glob pattern coexisting", () =>
      provide(
        Effect.gen(function* () {
          const result = yield* determineSkillsToInstall(
            skills("effect-basics", "effect-stream", "commit", "review-pr"),
            {
              requestedSkills: ["effect-*", "commit"],
              all: false,
            },
          );

          expect(result.map((s) => s.skill.name)).toEqual([
            "effect-basics",
            "effect-stream",
            "commit",
          ]);
        }),
      ),
    );

    it.effect("errors when glob pattern matches nothing", () =>
      provide(
        Effect.gen(function* () {
          const error = yield* determineSkillsToInstall(skills("commit", "review-pr"), {
            requestedSkills: ["effect-*"],
            all: false,
          }).pipe(Effect.flip);

          expect(error._tag).toBe("AppError");
          expect((error as AppError).details.join(", ")).toContain("commit");
          expect((error as AppError).details.join(", ")).toContain("review-pr");
        }),
      ),
    );
  });

  describe("--all / --non-interactive (rule 2)", () => {
    it.effect("returns all skills with --all", () =>
      provide(
        Effect.gen(function* () {
          const result = yield* determineSkillsToInstall(skills("commit", "review-pr"), {
            requestedSkills: [],
            all: true,
          });

          expect(result.map((s) => s.skill.name)).toEqual(["commit", "review-pr"]);
        }),
      ),
    );

    it.effect("returns all skills with --non-interactive", () =>
      provideWithFlags({ nonInteractive: true })(
        Effect.gen(function* () {
          const result = yield* determineSkillsToInstall(skills("commit", "review-pr"), {
            requestedSkills: [],
            all: false,
          });

          expect(result.map((s) => s.skill.name)).toEqual(["commit", "review-pr"]);
        }),
      ),
    );

    it.effect("--yes with multiple skills still prompts for selection", () =>
      provideWithFlags({ nonInteractive: false })(
        Effect.gen(function* () {
          // --yes alone does NOT auto-select; falls through to multiselect prompt (rule 4)
          const result = yield* determineSkillsToInstall(skills("commit", "review-pr"), {
            requestedSkills: [],
            all: false,
          });

          // The multiselect test layer returns indices [0, 1], so both are selected via prompt
          expect(result.map((s) => s.skill.name)).toEqual(["commit", "review-pr"]);
        }),
      ),
    );
  });

  describe("single skill (rule 3)", () => {
    it.effect("auto-selects single skill without prompting", () =>
      provide(
        Effect.gen(function* () {
          const result = yield* determineSkillsToInstall(skills("commit"), {
            requestedSkills: [],
            all: false,
          });

          expect(result.map((s) => s.skill.name)).toEqual(["commit"]);
        }),
      ),
    );
  });

  describe("multiple skills (rule 4)", () => {
    it.effect("prompts multiselect for multiple skills", () =>
      provide(
        Effect.gen(function* () {
          const result = yield* determineSkillsToInstall(skills("commit", "review-pr"), {
            requestedSkills: [],
            all: false,
          });

          expect(result.map((s) => s.skill.name)).toEqual(["commit", "review-pr"]);
        }),
      ),
    );
  });
});
