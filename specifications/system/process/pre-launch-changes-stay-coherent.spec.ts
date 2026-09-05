import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "system/process/pre-launch-changes-stay-coherent",
  title: "Pre-launch contract changes land as one coherent break without compatibility paths",
  statement:
    "Until public launch, a contract change shall land as one coherent break that updates every affected producer, consumer, test, fixture, and document together, and shall not add compatibility shims, aliases, dual paths, or deprecation windows.",
  class: "process",
  role: "supporting",
  goals: ["dependable-change-process"],
  boundary: "repository",
  boundaryRationale:
    "The obligation is review-enforced; the repository supplies its declaration in the committed agent instructions from which every change is directed.",
  methods: ["contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "Human and agent reviewers enforce the clean-break policy on each change; the evidence establishes only that the policy is declared.",
  ],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "The obligation is time-boxed to the pre-launch period and its evidence establishes only that the clean-break policy is declared in the committed agent instructions; it cannot observe whether an individual change honored the policy.",
      retirementCondition:
        "Public launch of AXM, when backward compatibility returns to scope and this obligation is retired or superseded by the launch compatibility policy in the same change.",
    },
  ],
});

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

describe("Pre-launch change policy", () => {
  it.effect("repository instructions bind every change to the clean-break policy", () =>
    Effect.sync(() => {
      // The obligation is review-enforced; its executable projection is that
      // the policy remains declared where every change is instructed from.
      const instructions = fs
        .readFileSync(path.join(repoRoot, "AGENTS.md"), "utf8")
        .replace(/\s+/g, " ");
      expect(instructions).toContain("Pre-launch backward compatibility");
      expect(instructions).toContain(
        "backward compatibility is out of scope unless the task explicitly requires it",
      );
      expect(instructions).toContain("Do not add shims");
    }),
  );
});
