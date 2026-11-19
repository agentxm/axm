import { readFileSync } from "node:fs";

import { defineSpecification } from "@agentxm/specification-metadata";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

export const specification = defineSpecification({
  requirement: "extension-engineering/review-guidance",
  title: "Axe guides extension reviews across issues, improvements, and pruning",
  statement:
    "Axe shall guide reviewers to use applicable guides and patterns within the requested focus to identify grounded issues, improvements, and pruning opportunities where the agent can choose how to achieve the user's purpose with the evidence and authority available, retaining warranted constraints and leaving changes for the user's selection.",
  class: "human-factors",
  role: "experience",
  goals: ["authoring-and-creation"],
  boundary: "repository",
  boundaryRationale:
    "The authored skill and sibling knowledge bundle supply the review route and checklist. Host trials separately observe the resulting findings, scope, and selected edits.",
  methods: ["static", "review"],
  derivedFrom: [],
  supersedes: [],
  assumptions: ["The engineering pack's skill and knowledge bundle are available together."],
  openQuestions: [],
});

it.effect(
  "a reviewer following the skill can reach the three review lenses, the decision indexes, and the judgment principle",
  () =>
    Effect.sync(() => {
      const skill = readFileSync(new URL("../skills/axe/src/SKILL.md", import.meta.url), "utf8");
      const bundle = new URL("../knowledge/agent-extension-engineering/src/", import.meta.url);
      const route = skill.match(/^\|\s*Review\b[^|]*\|\s*`([^`]+)`/im)?.[1];
      if (!route) throw new Error("Axe has no route for reviewing an extension");

      const guide = new URL(route + ".md", bundle);
      const guidance = readFileSync(guide, "utf8");
      for (const lens of ["Issue", "Improvement", "Pruning"]) {
        expect(guidance).toMatch(new RegExp("^\\|\\s*" + lens + "\\s*\\|", "m"));
      }
      const destinations = Array.from(
        guidance.matchAll(/\]\([^)#]+\.md\)/g),
        (match) => new URL(match[0].slice(2, -1), guide).href,
      );
      expect(destinations).toContain(new URL("principles/preserve-agent-judgment.md", bundle).href);
      for (const index of ["guides/index.md", "patterns/index.md"]) {
        const destination = new URL(index, bundle);
        expect(destinations).toContain(destination.href);
        expect(readFileSync(destination, "utf8")).toMatch(/\]\([^)]+\.md\)/);
      }
    }),
);
