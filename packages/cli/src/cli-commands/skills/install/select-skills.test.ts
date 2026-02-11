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
import {
  type Log,
  type Multiselect,
  makeLogTestLayer,
  makeMultiselectTestLayer,
} from "../../../tui/index.js";
import type { SkillRef } from "../operations.js";
import { InstallError } from "./handler.js";
import { determineSkillsToInstall } from "./select-skills.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeSkill = (name: string): SkillRef => ({
  type: "skill",
  skill: { name, description: "", metadata: Option.none() },
  source: { type: "local", path: `/fake/${name}` },
  location: `file:///fake/${name}`,
  version: Option.none(),
  gitTreeSha: Option.none(),
});

const [logLayer] = makeLogTestLayer();
const [multiselectLayer] = makeMultiselectTestLayer({ type: "return", indices: [0, 1] });
const TestLayer = Layer.mergeAll(logLayer, multiselectLayer);

const provide = <A, E>(effect: Effect.Effect<A, E, Log | Multiselect>) =>
  effect.pipe(Effect.provide(TestLayer));

/** Helper to create a NonEmptyReadonlyArray of skills. */
const skills = (...names: [string, ...string[]]): Array.NonEmptyReadonlyArray<SkillRef> =>
  names.map((n) => makeSkill(n)) as unknown as Array.NonEmptyReadonlyArray<SkillRef>;

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
            yes: false,
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
            yes: false,
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
            yes: false,
          }).pipe(Effect.flip);

          expect(error._tag).toBe("InstallError");
          expect((error as InstallError).message).toContain("No skills matched");
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
              yes: false,
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
              yes: false,
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
              yes: false,
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
            yes: false,
          }).pipe(Effect.flip);

          expect(error._tag).toBe("InstallError");
          expect((error as InstallError).message).toContain("commit");
          expect((error as InstallError).message).toContain("review-pr");
        }),
      ),
    );
  });

  describe("--all / --yes (rule 2)", () => {
    it.effect("returns all skills with --all", () =>
      provide(
        Effect.gen(function* () {
          const result = yield* determineSkillsToInstall(skills("commit", "review-pr"), {
            requestedSkills: [],
            all: true,
            yes: false,
          });

          expect(result.map((s) => s.skill.name)).toEqual(["commit", "review-pr"]);
        }),
      ),
    );

    it.effect("returns all skills with --yes", () =>
      provide(
        Effect.gen(function* () {
          const result = yield* determineSkillsToInstall(skills("commit", "review-pr"), {
            requestedSkills: [],
            all: false,
            yes: true,
          });

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
            yes: false,
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
            yes: false,
          });

          expect(result.map((s) => s.skill.name)).toEqual(["commit", "review-pr"]);
        }),
      ),
    );
  });
});
