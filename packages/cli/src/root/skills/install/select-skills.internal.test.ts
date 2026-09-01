/**
 * Unit tests for determineSkillsToInstall.
 *
 * Tests the skill selection logic given already-discovered skills.
 */

import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { TestRenderer } from "@agentxm/extension-management/unstable/cli-renderer";
import { TestFlagsLayer } from "@agentxm/extension-management/unstable/cli-flags";
import type { SkillExtensionRef } from "@agentxm/extension-management/unstable/workspace";
import { extensionName, handle } from "../../../test-stubs.js";
import { getAppError } from "../../../test-helpers.js";
import { determineSkillsToInstall } from "./select-skills.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeSkill = (name: string): SkillExtensionRef => ({
  type: "skill",
  refType: "local",
  owner: handle("@local"),
  name: extensionName(name),
  skill: { name: extensionName(name), description: Option.none(), metadata: Option.none() },
  source: { type: "local", path: `/fake/${name}` },
  location: `file:///fake/${name}`,
});

const { layer: rendererLayer } = TestRenderer.make();
const makeTestLayer = (envOverrides: Parameters<typeof TestFlagsLayer>[0] = {}) =>
  Layer.mergeAll(NodeServices.layer, rendererLayer, TestFlagsLayer(envOverrides));

type TestR = Layer.Success<ReturnType<typeof makeTestLayer>>;

const provide = <A, E>(effect: Effect.Effect<A, E, TestR>) =>
  effect.pipe(Effect.provide(makeTestLayer()));

const provideWith = (envOverrides: Parameters<typeof TestFlagsLayer>[0] = {}) => {
  const layer = makeTestLayer(envOverrides);
  return <A, E>(effect: Effect.Effect<A, E, TestR>) => effect.pipe(Effect.provide(layer));
};

/** Helper to create a NonEmptyReadonlyArray of skills. */
const skills = (
  first: string,
  ...rest: ReadonlyArray<string>
): Array.NonEmptyReadonlyArray<SkillExtensionRef> => [
  makeSkill(first),
  ...rest.map((name) => makeSkill(name)),
];

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
          const error = getAppError(
            yield* determineSkillsToInstall(skills("commit"), {
              requestedSkills: ["foo", "bar"],
              all: false,
            }).pipe(Effect.flip),
          );

          expect(error._tag).toBe("AppError");
          expect(error.detail).toBe("No skills matched: foo, bar. Source contains: commit");
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
          const error = getAppError(
            yield* determineSkillsToInstall(skills("commit", "review-pr"), {
              requestedSkills: ["effect-*"],
              all: false,
            }).pipe(Effect.flip),
          );

          expect(error._tag).toBe("AppError");
          expect(error.detail).toContain("effect-*");
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
      provideWith({ nonInteractive: true })(
        Effect.gen(function* () {
          const result = yield* determineSkillsToInstall(skills("commit", "review-pr"), {
            requestedSkills: [],
            all: false,
          });

          expect(result.map((s) => s.skill.name)).toEqual(["commit", "review-pr"]);
        }),
      ),
    );

    it.effect("--yes with multiple skills still prompts for selection", () => {
      const availableSkills = skills("commit", "review-pr");
      const selectCalls: Array<ReadonlyArray<string>> = [];
      return Effect.gen(function* () {
        const result = yield* determineSkillsToInstall(
          availableSkills,
          {
            requestedSkills: [],
            all: false,
          },
          {
            selectSkills: (skills) => {
              selectCalls.push(skills.map((skill) => skill.skill.name));
              return Effect.succeed(skills);
            },
          },
        );

        expect(result.map((s) => s.skill.name)).toEqual(["commit", "review-pr"]);
        expect(selectCalls).toEqual([["commit", "review-pr"]]);
      }).pipe(Effect.provide(makeTestLayer({ nonInteractive: false })));
    });
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
    it.effect("prompts multiselect for multiple skills", () => {
      const availableSkills = skills("commit", "review-pr");
      const selectCalls: Array<ReadonlyArray<string>> = [];
      return Effect.gen(function* () {
        const result = yield* determineSkillsToInstall(
          availableSkills,
          {
            requestedSkills: [],
            all: false,
          },
          {
            selectSkills: (skills) => {
              selectCalls.push(skills.map((skill) => skill.skill.name));
              return Effect.succeed(skills);
            },
          },
        );

        expect(result.map((s) => s.skill.name)).toEqual(["commit", "review-pr"]);
        expect(selectCalls).toEqual([["commit", "review-pr"]]);
      }).pipe(Effect.provide(makeTestLayer({ nonInteractive: false })));
    });
  });
});
