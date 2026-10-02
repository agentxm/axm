import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import {
  makePublishWorld,
  publishDocument,
  publishFailureOf,
  requestFor,
  runPublish,
  type PublishWorld,
} from "../test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/publish/respects-local-pack-constraints",
  title: "Publication respects workspace pack constraints",
  statement:
    "When an authored member selected for publication is excluded by a workspace-authored pack constraint, publish shall reject it in preview and apply, name the member and the conflicting pack constraint, and offer the repair that edits that pack's constraint, while a member version the Registry already has remains a successful skip that blocks no other upload.",
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

  const constrainedWorld = (memberConstraint: string, otherSkills: ReadonlyArray<string> = []) => {
    const world = makePublishWorld({
      settings: {
        skills: Object.fromEntries(
          ["review", ...otherSkills].map((name) => [name, "workspace"] as const),
        ),
        packs: { reviewers: "workspace" },
      },
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
    "publishes a coordinated repair, then skips the already published member whatever a local pack later declares",
    () =>
      Effect.gen(function* () {
        const world = constrainedWorld("^0.0.5", ["fresh"]);

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
        world.write("skill", { name: "fresh" });
        world.write("pack", {
          name: "reviewers",
          dependencies: { "@acme/skills/review": "^0.0.4" },
        });

        const outcome = yield* world.provide(runPublish(requestFor(world, { preview: false })));

        expect(outcome.disposition._tag).toBe("Completed");
        const rows = publishDocument(outcome).execution.outcomes;
        for (const id of ["@acme/skills/review", "@acme/packs/reviewers"]) {
          expect(rows.find((row) => row.id === id)).toMatchObject({
            action: "skip",
            status: "success",
            reason: "version_already_published",
          });
        }
        expect(rows.find((row) => row.id === "@acme/skills/fresh")).toMatchObject({
          action: "publish",
          status: "success",
        });
        expect(world.archive("fresh").length).toBeGreaterThan(0);
      }),
  );
});
