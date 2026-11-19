import { readFileSync } from "node:fs";

import { defineSpecification } from "@agentxm/specification-metadata";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

export const specification = defineSpecification({
  requirement: "extension-engineering/domain-glossary-guidance",
  title: "Authors can distinguish designing a domain glossary from looking up a term",
  statement:
    "The engineering pack shall direct glossary authors to guidance on LLM-drafted, computationally derived, and hand-authored entries and direct readers looking up extension terminology to the shared glossary.",
  class: "human-factors",
  role: "experience",
  goals: ["authoring-and-creation"],
  boundary: "repository",
  boundaryRationale:
    "The authored routes and their destinations establish what guidance the pack makes available. Agent selection and practitioner agreement on definitions require separate evidence.",
  methods: ["static", "review"],
  derivedFrom: [],
  supersedes: [],
  assumptions: ["The engineering skill and knowledge bundle are available together."],
  openQuestions: [],
});

it.effect("glossary authors and term readers can follow distinct routes in Axe", () =>
  Effect.sync(() => {
    const skill = readFileSync(new URL("../skills/axe/src/SKILL.md", import.meta.url), "utf8");
    const bundle = new URL("../knowledge/agent-extension-engineering/src/", import.meta.url);
    const routes = Array.from(skill.matchAll(/^\| ([^|]+)\|\s*`([^`]+)`\s*\|$/gm));

    function readRoute(intent: RegExp) {
      const route = routes.find(([, cue = ""]) => intent.test(cue))?.[2];
      if (!route) throw new Error(`Missing engineering skill route for ${intent}`);
      return readFileSync(new URL(route + ".md", bundle), "utf8");
    }

    const design = readRoute(/(?:design|maintain).*glossary/i);
    for (const variant of ["LLM-drafted", "Computationally derived", "Hand-authored"]) {
      expect(design).toContain(variant);
    }
    expect(readRoute(/(?:define|distinguish).*terms/i)).toMatch(/^### Open agent$/m);
  }),
);
