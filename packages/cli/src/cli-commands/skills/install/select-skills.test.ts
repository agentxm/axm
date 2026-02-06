/**
 * Unit tests for selectSkills.
 *
 * Tests the priority-ordered skill selection logic extracted from the handler.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeClackTestLayer } from "../../../clack-effect/index.js";
import type { DiscoveredSkill } from "../../../extensions/skills/index.js";
import type { ExtensionRef } from "../../../extensions/common.js";
import type { LocalSource, RegistrySource } from "../../../sources/index.js";
import { InstallError } from "./handler.js";
import { selectSkills } from "./select-skills.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeSkill = (name: string, pathLength = 1): DiscoveredSkill => {
  const refs: ExtensionRef[] = [];
  for (let i = 0; i < pathLength - 1; i++) {
    refs.push({ name: `pack-${i}`, type: "pack" });
  }
  refs.push({ name, type: "skill" });

  return {
    name,
    path: `/fake/${name}/SKILL.md`,
    description: Option.none(),
    discoveryPath: refs as unknown as Array.NonEmptyReadonlyArray<ExtensionRef>,
  };
};

/** Create a NonEmptyReadonlyArray from skill args. */
const makeSkills = (
  first: DiscoveredSkill,
  ...rest: DiscoveredSkill[]
): Array.NonEmptyReadonlyArray<DiscoveredSkill> => [first, ...rest];

const localSource: LocalSource = { source: "local", path: "/fake/source" };

const registrySource: RegistrySource = { source: "registry", url: "https://example.com" };

const [ClackTestLayer] = makeClackTestLayer({
  confirmBehavior: Option.some({ type: "return", value: true }),
  selectBehavior: Option.none(),
  multiselectBehavior: Option.some({ type: "return", indices: [0, 1] }),
});

const provide = <A, E>(
  effect: Effect.Effect<A, E, import("../../../clack-effect/index.js").Clack>,
) => effect.pipe(Effect.provide(ClackTestLayer));

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("selectSkills", () => {
  describe("--skill flag (priority 1)", () => {
    it.effect("returns matching skills when all names are valid", () =>
      provide(
        Effect.gen(function* () {
          const result = yield* selectSkills({
            skills: makeSkills(makeSkill("commit"), makeSkill("review-pr"), makeSkill("debug")),
            source: localSource,
            requestedSkills: ["commit", "debug"],
            all: false,
            dryRun: false,
            canPrompt: true,
          });

          expect(result.map((s) => s.name)).toEqual(["commit", "debug"]);
        }),
      ),
    );

    it.effect("errors when any requested skill name is unknown", () =>
      provide(
        Effect.gen(function* () {
          const error = yield* selectSkills({
            skills: makeSkills(makeSkill("commit")),
            source: localSource,
            requestedSkills: ["commit", "nonexistent"],
            all: false,
            dryRun: false,
            canPrompt: true,
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
          const error = yield* selectSkills({
            skills: makeSkills(makeSkill("commit")),
            source: localSource,
            requestedSkills: ["foo", "bar"],
            all: false,
            dryRun: false,
            canPrompt: true,
          }).pipe(Effect.flip);

          expect(error._tag).toBe("InstallError");
          expect((error as InstallError).message).toContain("foo");
          expect((error as InstallError).message).toContain("bar");
        }),
      ),
    );
  });

  describe("--all / --dry-run (priority 2)", () => {
    it.effect("returns all skills with --all", () =>
      provide(
        Effect.gen(function* () {
          const result = yield* selectSkills({
            skills: makeSkills(makeSkill("commit"), makeSkill("review-pr")),
            source: localSource,
            requestedSkills: [],
            all: true,
            dryRun: false,
            canPrompt: false,
          });

          expect(result.map((s) => s.name)).toEqual(["commit", "review-pr"]);
        }),
      ),
    );

    it.effect("returns all skills with --dry-run", () =>
      provide(
        Effect.gen(function* () {
          const result = yield* selectSkills({
            skills: makeSkills(makeSkill("commit"), makeSkill("review-pr")),
            source: localSource,
            requestedSkills: [],
            all: false,
            dryRun: true,
            canPrompt: false,
          });

          expect(result.map((s) => s.name)).toEqual(["commit", "review-pr"]);
        }),
      ),
    );
  });

  describe("registry source (priorities 3-4)", () => {
    it.effect("auto-selects single skill not from pack", () =>
      provide(
        Effect.gen(function* () {
          const result = yield* selectSkills({
            skills: makeSkills(makeSkill("commit", 1)),
            source: registrySource,
            requestedSkills: [],
            all: false,
            dryRun: false,
            canPrompt: true,
          });

          expect(result.map((s) => s.name)).toEqual(["commit"]);
        }),
      ),
    );

    it.effect("confirms single skill from pack", () =>
      provide(
        Effect.gen(function* () {
          const result = yield* selectSkills({
            skills: makeSkills(makeSkill("commit", 2)),
            source: registrySource,
            requestedSkills: [],
            all: false,
            dryRun: false,
            canPrompt: true,
          });

          expect(result.map((s) => s.name)).toEqual(["commit"]);
        }),
      ),
    );

    it.effect("prompts multiselect for multiple skills from pack", () =>
      provide(
        Effect.gen(function* () {
          const result = yield* selectSkills({
            skills: makeSkills(makeSkill("commit", 2), makeSkill("review-pr", 2)),
            source: registrySource,
            requestedSkills: [],
            all: false,
            dryRun: false,
            canPrompt: true,
          });

          expect(result.map((s) => s.name)).toEqual(["commit", "review-pr"]);
        }),
      ),
    );
  });

  describe("non-registry source (priorities 5-7)", () => {
    it.effect("auto-selects single skill", () =>
      provide(
        Effect.gen(function* () {
          const result = yield* selectSkills({
            skills: makeSkills(makeSkill("commit")),
            source: localSource,
            requestedSkills: [],
            all: false,
            dryRun: false,
            canPrompt: false,
          });

          expect(result.map((s) => s.name)).toEqual(["commit"]);
        }),
      ),
    );

    it.effect("errors when multiple skills and can't prompt", () =>
      provide(
        Effect.gen(function* () {
          const error = yield* selectSkills({
            skills: makeSkills(makeSkill("commit"), makeSkill("review-pr")),
            source: localSource,
            requestedSkills: [],
            all: false,
            dryRun: false,
            canPrompt: false,
          }).pipe(Effect.flip);

          expect(error._tag).toBe("InstallError");
          expect((error as InstallError).message).toContain("Cannot prompt for skill selection");
        }),
      ),
    );

    it.effect("prompts multiselect when multiple skills and can prompt", () =>
      provide(
        Effect.gen(function* () {
          const result = yield* selectSkills({
            skills: makeSkills(makeSkill("commit"), makeSkill("review-pr")),
            source: localSource,
            requestedSkills: [],
            all: false,
            dryRun: false,
            canPrompt: true,
          });

          expect(result.map((s) => s.name)).toEqual(["commit", "review-pr"]);
        }),
      ),
    );
  });
});
