import { describe, expect, it } from "@effect/vitest";
import { axmBooleanEnabled } from "@agentxm/host-primitives";
import { defineSpecification } from "@agentxm/specification-metadata";

export const specification = defineSpecification({
  requirement: "cli/environment/booleans-use-one-grammar",
  title: "AXM on/off environment inputs use one vocabulary",
  statement:
    "Every AXM on/off environment variable shall enable on exact 1 or true, disable on exact 0 or false, and use its documented default for any other value or absence. Standard environment inputs and multi-valued mode selectors retain their own vocabularies.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["decision-table"],
  derivedFrom: [
    "cli/ascii-human-output-preserves-content",
    "cli/environment-disables-startup-update-check",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("AXM on/off vocabulary", () => {
  for (const row of [
    { value: "1", off: true, on: true },
    { value: "true", off: true, on: true },
    { value: "0", off: false, on: false },
    { value: "false", off: false, on: false },
    ...[undefined, "", "TRUE", "False", "yes", "on", "2", " true "].map((value) => ({
      value,
      off: false,
      on: true,
    })),
  ]) {
    it(`honors explicit values and both defaults for ${String(row.value)}`, () => {
      expect(axmBooleanEnabled(row.value, false)).toBe(row.off);
      expect(axmBooleanEnabled(row.value, true)).toBe(row.on);
    });
  }
});
