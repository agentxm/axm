import { readFileSync } from "node:fs";

import { defineSpecification } from "@agentxm/specification-metadata";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

export const specification = defineSpecification({
  requirement: "extension-engineering/review-coverage",
  title: "Axe reviews show the evidence behind their verdict",
  statement:
    "Every Axe review shall place a coverage checklist immediately below its verdict, pairing each applicable emoji with a text label and tying each material check to confirming evidence, a numbered finding, the evidence still needed, or a material activity outside scope.",
  class: "human-factors",
  role: "experience",
  goals: ["authoring-and-creation"],
  boundary: "repository",
  boundaryRationale:
    "The sibling knowledge bundle supplies the report template. Static evidence checks its reader-facing example and status vocabulary. Host trials exercise the resulting reports.",
  methods: ["static", "review"],
  derivedFrom: [],
  supersedes: [],
  assumptions: ["The reviewer can access the axe skill and its engineering knowledge bundle."],
  openQuestions: [],
});

it.effect("the report template demonstrates coverage before actionable findings", () =>
  Effect.sync(() => {
    const guide = readFileSync(
      new URL(
        "../knowledge/agent-extension-engineering/src/guides/reviewing-extensions.md",
        import.meta.url,
      ),
      "utf8",
    );
    for (const status of ["✅ Confirmed", "❌ Finding", "❔ Inconclusive", "➖ Not exercised"]) {
      expect(guide).toContain(status);
    }
    const example = guide.split("\n").filter((line) => line.startsWith(">"));
    const content = example.filter((line) => line.trim() !== ">");
    expect(content[0]).toMatch(/findings/i);
    expect(content[1]).toContain("Review coverage");
    expect(content[2]).toMatch(/❌.*Finding.*finding 1/i);
  }),
);
