import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import {
  makePublishWorld,
  publishFailureOf,
  requestFor,
  runPublish,
  type PublishWorld,
} from "../test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/publish/respects-local-pack-constraints",
  title: "Publication respects workspace pack constraints",
  statement:
    "When an authored member selected for publication is excluded by a workspace-authored pack constraint, publish shall reject it in preview and apply, including existing-version verification, name the member and the conflicting pack constraint, and offer the repair that edits that pack's constraint.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution"],
  methods: ["example", "decision-table"],
  derivedFrom: [
    "apps/cli/src/root/publish/command.test.ts",
    "apps/cli/src/root/publish/command.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "A member constrained by an acquired pack, whose authority is the Registry rather than this workspace, is not exercised; the statement was narrowed to the authored-pack repair the examples establish.",
      retirementCondition:
        "A row selects a member constrained by an acquired pack, states the repair that refusal offers, and the statement is widened back to every pack authority.",
    },
  ],
});

describe("Workspace pack constraints at publication", () => {
  const worlds: Array<PublishWorld> = [];
  afterEach(() => {
    for (const world of worlds.splice(0)) world.cleanup();
  });

  const constrainedWorld = (memberConstraint: string) => {
    const world = makePublishWorld({
      settings: { skills: { review: "workspace" }, packs: { reviewers: "workspace" } },
    });
    worlds.push(world);
    world.write("skill", { name: "review", version: "0.0.5" });
    world.write("pack", {
      name: "reviewers",
      dependencies: { "@acme/skills/review": memberConstraint },
    });
    return world;
  };

  for (const scenario of [
    { name: "explicit apply", preview: false, selectors: ["@acme/skills/review"] },
    { name: "explicit preview", preview: true, selectors: ["@acme/skills/review"] },
    { name: "authored bulk apply", preview: false, selectors: [] },
  ]) {
    it.effect(scenario.name, () =>
      Effect.gen(function* () {
        const world = constrainedWorld("^0.0.4");

        const outcome = yield* world.provide(
          runPublish(
            requestFor(world, { selectors: scenario.selectors, preview: scenario.preview }),
          ),
        );

        const failure = publishFailureOf(outcome);
        expect(failure.category).toBe("validation");
        expect(failure.detail).toContain("@acme/skills/review@0.0.5");
        expect(failure.detail).toContain("@acme/packs/reviewers declares ^0.0.4");
        expect(failure.suggestions).toContainEqual({
          description:
            "Replace @acme/packs/reviewers's constraint with the selected version, then publish the member and pack together",
          cmd: "axm packs add @acme/packs/reviewers @acme/skills/review",
        });
        expect(world.target.storedFiles()).toEqual([]);
      }),
    );
  }

  it.effect(
    "publishes a coordinated repair and still checks local constraints before an immutable-version skip",
    () =>
      Effect.gen(function* () {
        const world = constrainedWorld("^0.0.5");

        yield* world.provide(
          runPublish(
            requestFor(world, {
              selectors: ["@acme/skills/review", "@acme/packs/reviewers"],
              preview: false,
            }),
          ),
        );
        expect(world.archive("review", "0.0.5").length).toBeGreaterThan(0);
        expect(world.archive("reviewers", "1.0.0", "packs").length).toBeGreaterThan(0);
        const before = world.snapshotRegistry();
        world.write("pack", {
          name: "reviewers",
          dependencies: { "@acme/skills/review": "^0.0.4" },
        });

        const outcome = yield* world.provide(
          runPublish(
            requestFor(world, {
              selectors: ["@acme/skills/review"],
              preview: false,
              onExisting: Option.some("verify"),
            }),
          ),
        );

        const failure = publishFailureOf(outcome);
        expect(failure.category).toBe("validation");
        expect(failure.detail).toContain("@acme/packs/reviewers declares ^0.0.4");
        expect(world.snapshotRegistry()).toEqual(before);
      }),
  );
});
