/**
 * Unit tests for determineSkillsToInstall.
 *
 * Tests the simplified skill selection logic.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeClackTestLayer } from "../../../clack-effect/index.js";
import type { DiscoveredSkill } from "../../../extensions/skills/index.js";
import type { ExtensionRef } from "../../../extensions/common.js";
import type { ResolvedSource } from "./handler.js";
import { InstallError } from "./handler.js";
import { determineSkillsToInstall } from "./select-skills.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const localSource = { source: "local" as const, path: "/fake" };

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

const fakeResolvedSource: ResolvedSource = {
  source: localSource,
  skillsDir: "/fake",
  commitSha: Option.none(),
};

/** Create a discover effect that returns the given skills. */
const makeDiscover = (...skills: DiscoveredSkill[]) =>
  Effect.succeed({
    skills,
    resolvedSource: fakeResolvedSource,
  });

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

describe("determineSkillsToInstall", () => {
  describe("discovery", () => {
    it.effect("errors when no skills found", () =>
      provide(
        Effect.gen(function* () {
          const error = yield* determineSkillsToInstall({
            discover: makeDiscover(),
            sourceLabel: "test",
            requestedSkills: [],
            all: false,
            dryRun: false,
            yes: false,
            list: false,
          }).pipe(Effect.flip);

          expect(error._tag).toBe("InstallError");
          expect((error as InstallError).message).toContain("No skills found");
        }),
      ),
    );
  });

  describe("--list flag", () => {
    it.effect("returns all skills with list: true", () =>
      provide(
        Effect.gen(function* () {
          const result = yield* determineSkillsToInstall({
            discover: makeDiscover(makeSkill("commit"), makeSkill("review-pr")),
            sourceLabel: "test",
            requestedSkills: [],
            all: false,
            dryRun: false,
            yes: false,
            list: true,
          });

          expect(result.list).toBe(true);
          expect(result.selectedSkills.map((s) => s.name)).toEqual(["commit", "review-pr"]);
          expect(result.resolvedSource).toBe(fakeResolvedSource);
        }),
      ),
    );
  });

  describe("--skill flag (rule 1)", () => {
    it.effect("returns matching skills when all names are valid", () =>
      provide(
        Effect.gen(function* () {
          const result = yield* determineSkillsToInstall({
            discover: makeDiscover(makeSkill("commit"), makeSkill("review-pr"), makeSkill("debug")),
            sourceLabel: "test",
            requestedSkills: ["commit", "debug"],
            all: false,
            dryRun: false,
            yes: false,
            list: false,
          });

          expect(result.selectedSkills.map((s) => s.name)).toEqual(["commit", "debug"]);
          expect(result.list).toBe(false);
        }),
      ),
    );

    it.effect("errors when any requested skill name is unknown", () =>
      provide(
        Effect.gen(function* () {
          const error = yield* determineSkillsToInstall({
            discover: makeDiscover(makeSkill("commit")),
            sourceLabel: "test",
            requestedSkills: ["commit", "nonexistent"],
            all: false,
            dryRun: false,
            yes: false,
            list: false,
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
          const error = yield* determineSkillsToInstall({
            discover: makeDiscover(makeSkill("commit")),
            sourceLabel: "test",
            requestedSkills: ["foo", "bar"],
            all: false,
            dryRun: false,
            yes: false,
            list: false,
          }).pipe(Effect.flip);

          expect(error._tag).toBe("InstallError");
          expect((error as InstallError).message).toContain("foo");
          expect((error as InstallError).message).toContain("bar");
        }),
      ),
    );
  });

  describe("--all / --dry-run / --yes (rule 2)", () => {
    it.effect("returns all skills with --all", () =>
      provide(
        Effect.gen(function* () {
          const result = yield* determineSkillsToInstall({
            discover: makeDiscover(makeSkill("commit"), makeSkill("review-pr")),
            sourceLabel: "test",
            requestedSkills: [],
            all: true,
            dryRun: false,
            yes: false,
            list: false,
          });

          expect(result.selectedSkills.map((s) => s.name)).toEqual(["commit", "review-pr"]);
        }),
      ),
    );

    it.effect("returns all skills with --dry-run", () =>
      provide(
        Effect.gen(function* () {
          const result = yield* determineSkillsToInstall({
            discover: makeDiscover(makeSkill("commit"), makeSkill("review-pr")),
            sourceLabel: "test",
            requestedSkills: [],
            all: false,
            dryRun: true,
            yes: false,
            list: false,
          });

          expect(result.selectedSkills.map((s) => s.name)).toEqual(["commit", "review-pr"]);
        }),
      ),
    );

    it.effect("returns all skills with --yes", () =>
      provide(
        Effect.gen(function* () {
          const result = yield* determineSkillsToInstall({
            discover: makeDiscover(makeSkill("commit"), makeSkill("review-pr")),
            sourceLabel: "test",
            requestedSkills: [],
            all: false,
            dryRun: false,
            yes: true,
            list: false,
          });

          expect(result.selectedSkills.map((s) => s.name)).toEqual(["commit", "review-pr"]);
        }),
      ),
    );
  });

  describe("single skill (rule 3)", () => {
    it.effect("auto-selects single skill without prompting", () =>
      provide(
        Effect.gen(function* () {
          const result = yield* determineSkillsToInstall({
            discover: makeDiscover(makeSkill("commit")),
            sourceLabel: "test",
            requestedSkills: [],
            all: false,
            dryRun: false,
            yes: false,
            list: false,
          });

          expect(result.selectedSkills.map((s) => s.name)).toEqual(["commit"]);
        }),
      ),
    );

    it.effect("auto-selects single skill from pack without prompting", () =>
      provide(
        Effect.gen(function* () {
          const result = yield* determineSkillsToInstall({
            discover: makeDiscover(makeSkill("commit", 2)),
            sourceLabel: "test",
            requestedSkills: [],
            all: false,
            dryRun: false,
            yes: false,
            list: false,
          });

          expect(result.selectedSkills.map((s) => s.name)).toEqual(["commit"]);
        }),
      ),
    );
  });

  describe("multiple skills (rule 4)", () => {
    it.effect("prompts multiselect for multiple skills", () =>
      provide(
        Effect.gen(function* () {
          const result = yield* determineSkillsToInstall({
            discover: makeDiscover(makeSkill("commit"), makeSkill("review-pr")),
            sourceLabel: "test",
            requestedSkills: [],
            all: false,
            dryRun: false,
            yes: false,
            list: false,
          });

          expect(result.selectedSkills.map((s) => s.name)).toEqual(["commit", "review-pr"]);
        }),
      ),
    );
  });
});
