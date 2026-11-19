import { readFileSync } from "node:fs";

import { defineSpecification } from "@agentxm/specification-metadata";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

export const specification = defineSpecification({
  requirement: "extension-engineering/remedy-selection",
  title: "Callers can select a recommended or alternative remedy in one reply",
  statement:
    "AXE review guidance shall let the caller select the displayed recommendation by finding number or a particular displayed alternative by finding number and remedy letter.",
  class: "human-factors",
  role: "experience",
  goals: ["authoring-and-creation"],
  boundary: "repository",
  boundaryRationale:
    "The knowledge pattern demonstrates the two selections and their distinct effects. Actual interpretation in a host requires a trial.",
  methods: ["static", "review"],
  derivedFrom: [],
  supersedes: [],
  assumptions: ["The caller has received a numbered finding with alternative remedies."],
  openQuestions: [],
});

it.effect(
  "the same finding offers a link repair and a separately selectable standalone guide",
  () =>
    Effect.sync(() => {
      const pattern = readFileSync(
        new URL("../knowledge/axe/src/patterns/select-from-findings.md", import.meta.url),
        "utf8",
      ).replace(/\s+/gu, " ");
      expect(pattern).toContain("2a (Recommended) · Link to the existing instructions");
      expect(pattern).toContain("2b · Ship a standalone migration guide");
      expect(pattern).toContain("`A 2` and `apply 2` select the recommendation");
      expect(pattern).toContain("`apply 2b` selects the standalone guide");
    }),
);
