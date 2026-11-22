import { readFileSync } from "node:fs";

import { defineSpecification } from "@agentxm/specification-metadata";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

export const specification = defineSpecification({
  requirement: "extension-engineering/naming-neighbors-guidance",
  title: "Authors learn when an extension may name another extension",
  statement:
    "The engineering pack shall guide authors to name another extension only through a relationship the manifests declare, and otherwise to draw the boundary by the work that differs, from the skill authoring, extension set, and README guides.",
  class: "human-factors",
  role: "experience",
  goals: ["authoring-and-creation"],
  boundary: "repository",
  boundaryRationale:
    "The shipped pattern holds the rule and the guides an author follows link to it. Reading those routes does not exercise host skill selection.",
  methods: ["static", "review"],
  derivedFrom: [],
  supersedes: [],
  assumptions: ["The engineering skill and knowledge bundle are available together."],
  openQuestions: [],
});

it.effect("authors reach the naming rule from the guides that settle a boundary", () =>
  Effect.sync(() => {
    const bundle = new URL("../knowledge/axe/src/", import.meta.url);
    const pattern = readFileSync(new URL("patterns/neighboring-intent.md", bundle), "utf8");
    expect(pattern).toMatch(/^## Naming a neighbor$/m);
    for (const relationship of ["standalone: false", "recommendedPacks", "None"]) {
      expect(pattern).toContain(relationship);
    }
    for (const guide of [
      "guides/authoring-skills.md",
      "guides/extension-sets.md",
      "guides/authoring-readme.md",
    ]) {
      expect(readFileSync(new URL(guide, bundle), "utf8"), guide).toContain(
        "../patterns/neighboring-intent.md#naming-a-neighbor",
      );
    }
  }),
);
