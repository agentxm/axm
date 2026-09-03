import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

import { UpgradeDocumentSchema } from "axm.sh/specification-harness";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "cli/upgrade/machine-result-is-upgrade-assessment",
  title: "Machine upgrade emits one complete assessment",
  statement:
    "Machine-mode upgrade shall emit one axm.upgrade-assessment/v1 result that separately records intent, platform, ownership, canonical selection, installer availability, target, mutation, verification, recovery, command evidence, and disposition.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Upgrade assessment contract", () => {
  it("requires every decision and evidence section in the versioned result", () => {
    const fields = UpgradeDocumentSchema.fields.result.fields;
    expect(Object.keys(fields).sort()).toEqual(
      [
        "canonical",
        "commands",
        "contract",
        "details",
        "disposition",
        "installerAvailability",
        "intent",
        "local",
        "message",
        "mutation",
        "outcome",
        "ownership",
        "platform",
        "recovery",
        "steps",
        "target",
        "verification",
      ].sort(),
    );
    expect(Schema.decodeUnknownSync(fields.contract)("axm.upgrade-assessment/v1")).toBe(
      "axm.upgrade-assessment/v1",
    );
  });
});
