import { readFileSync } from "node:fs";

import { defineSpecification } from "@agentxm/specification-metadata";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

export const specification = defineSpecification({
  requirement: "extension-engineering/target-choice",
  title: "Callers can select the intended scope of an ambiguous package name",
  statement:
    "When a package name remains ambiguous, Axe and AXM shall offer the qualified matches through a native picker or labeled text replies, put a context-supported recommendation first when one exists, offer the whole displayed set when the operation permits it, and resume the requested operation only after selection.",
  class: "human-factors",
  role: "experience",
  goals: ["authoring-and-creation"],
  boundary: "repository",
  boundaryRationale:
    "The shared example exposes the text choices and their identities. Host trials separately exercise skill instructions, native input and continuation.",
  methods: ["static", "review"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

it.effect(
  "the release review example offers its three distinct targets together or individually",
  () =>
    Effect.sync(() => {
      const pattern = readFileSync(
        new URL(
          "../knowledge/agent-extension-engineering/src/patterns/scope-selector.md",
          import.meta.url,
        ),
        "utf8",
      );
      const choices = pattern.split("\n").filter((line) => line.startsWith("- **"));
      expect(choices).toHaveLength(4);
      expect(choices[0]).toContain("All 3 matches (Recommended)");
      expect(choices[0]).toContain("`all`");
      const individualChoices = choices.slice(1);
      for (const kind of ["skills", "knowledge", "packs"]) {
        expect(
          individualChoices.filter((choice) => choice.includes(`@example/${kind}/docs`)),
        ).toHaveLength(1);
      }
    }),
);
