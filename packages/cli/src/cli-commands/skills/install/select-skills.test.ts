/**
 * Unit tests for determineSkillsToInstall.
 *
 * Tests the skill selection logic given already-discovered skills.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeClackTestLayer } from "../../../clack-effect/index.js";
import type { SkillRef } from "../operations.js";
import { InstallError } from "./handler.js";
import { determineSkillsToInstall } from "./select-skills.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeSkill = (name: string): SkillRef => ({
  skill: { name, description: "", metadata: Option.none() },
  path: Option.some(`/fake/${name}`),
  gitTreeSha: Option.none(),
  registry: Option.none(),
});

const [ClackTestLayer] = makeClackTestLayer({
  confirmBehavior: Option.some({ type: "return", value: true }),
  selectBehavior: Option.none(),
  multiselectBehavior: Option.some({ type: "return", indices: [0, 1] }),
});

const provide = <A, E>(
  effect: Effect.Effect<A, E, import("../../../clack-effect/index.js").Clack>,
) => effect.pipe(Effect.provide(ClackTestLayer));

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

    it.effect("errors when any requested skill name is unknown", () =>
      provide(
        Effect.gen(function* () {
          const error = yield* determineSkillsToInstall(skills("commit"), {
            requestedSkills: ["commit", "nonexistent"],
            all: false,
            yes: false,
          }).pipe(Effect.flip);

          expect(error._tag).toBe("InstallError");
          expect((error as InstallError).message).toContain("Unknown skill(s)");
          expect((error as InstallError).message).toContain("nonexistent");
        }),
      ),
    );

    it.effect("errors when all requested skills are unknown", () =>
      provide(
        Effect.gen(function* () {
          const error = yield* determineSkillsToInstall(skills("commit"), {
            requestedSkills: ["foo", "bar"],
            all: false,
            yes: false,
          }).pipe(Effect.flip);

          expect(error._tag).toBe("InstallError");
          expect((error as InstallError).message).toContain("foo");
          expect((error as InstallError).message).toContain("bar");
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
