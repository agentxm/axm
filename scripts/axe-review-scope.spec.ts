import { readFileSync } from "node:fs";
import { defineBoundEvidence, defineSpecification } from "@agentxm/specification-metadata";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

export const specification = defineSpecification({
  requirement: "extension-engineering/review-scope",
  title: "Extension reviews follow the caller's focus and available evidence",
  statement:
    "Axe review guidance shall preserve the caller's focus and support choosing and explaining the scope of an open review from the extension's purpose, the change, and the available evidence.",
  class: "human-factors",
  role: "experience",
  goals: ["authoring-and-creation"],
  boundary: "repository",
  boundaryRationale:
    "The shipped review guide expresses the decision. Paired, read-only host trials separately assess how reviewers apply it to open and focused requests.",
  methods: ["static", "review"],
  derivedFrom: [],
  supersedes: [],
  assumptions: ["The reviewer has access to the engineering knowledge bundle."],
  openQuestions: [],
});

export const boundEvidence = defineBoundEvidence([
  {
    gate: "review: skills/axe/evals/2026-11-18/review-scope.md",
    verifies:
      "Records findings, scope, and evidentiary limits for open, focused, corrected, and excerpt-only targets.",
  },
]);

it.effect(
  "the guidance leaves the choice of material questions with the reviewer within the caller's focus",
  () =>
    Effect.sync(() => {
      const guide = readFileSync(
        new URL(
          "../knowledge/agent-extension-engineering/src/guides/reviewing-extensions.md",
          import.meta.url,
        ),
        "utf8",
      ).replace(/\s+/gu, " ");
      expect(guide).toContain("Honor the caller's focus");
      expect(guide).toContain("choose what deserves inspection");
      expect(guide).toContain("State what you examined");
    }),
);
