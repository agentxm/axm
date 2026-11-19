import { readFileSync } from "node:fs";
import { defineSpecification } from "@agentxm/specification-metadata";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

export const specification = defineSpecification({
  requirement: "extension-engineering/review-scope",
  title: "Extension reviews follow the caller's focus and available evidence",
  statement:
    "Axe review guidance shall preserve the caller's focus and support choosing and explaining the scope of an open review from the extension's purpose, the change, and the available evidence. An open package review shall account for README presence and first-use guidance at each independently discoverable package in scope.",
  class: "human-factors",
  role: "experience",
  goals: ["authoring-and-creation"],
  boundary: "repository",
  boundaryRationale:
    "The shipped review guide expresses the decision. The trials in skills/axe/evals/2026-11-18 separately exercise open and focused reviews from pack and member entry points.",
  methods: ["static", "review"],
  derivedFrom: [],
  supersedes: [],
  assumptions: ["The reviewer has access to the engineering knowledge bundle."],
  openQuestions: [],
});

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
      expect(guide).toContain(
        "root `README.md` of each independently discoverable package in scope",
      );
      expect(guide).toContain("what it provides, what to install, and how to try it");
      expect(guide).toContain("An excerpt that omits a README leaves its presence open");
    }),
);
