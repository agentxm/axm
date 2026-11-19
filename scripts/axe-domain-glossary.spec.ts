import { readFileSync } from "node:fs";

import { defineSpecification } from "@agentxm/specification-metadata";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

export const specification = defineSpecification({
  requirement: "extension-engineering/domain-glossary-guidance",
  title: "Authors can distinguish designing a domain glossary from looking up a term",
  statement:
    "The engineering pack shall show glossary authors how a consuming extension uses a knowledge concept with LLM-drafted, computationally derived, or hand-authored entries and route terminology lookups to the shared glossary.",
  class: "human-factors",
  role: "experience",
  goals: ["authoring-and-creation"],
  boundary: "repository",
  boundaryRationale:
    "The route check locates the authoring variants and the term reference. Reviewing the worked example establishes what the consumer can decide from it. Host selection requires separate evidence.",
  methods: ["static", "review"],
  derivedFrom: [],
  supersedes: [],
  assumptions: ["The engineering skill and knowledge bundle are available together."],
  openQuestions: [],
});

it.effect("glossary authors and term readers can follow distinct routes in AXE", () =>
  Effect.sync(() => {
    const skill = readFileSync(new URL("../skills/axe/src/SKILL.md", import.meta.url), "utf8");
    const bundle = new URL("../knowledge/axe/src/", import.meta.url);
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
