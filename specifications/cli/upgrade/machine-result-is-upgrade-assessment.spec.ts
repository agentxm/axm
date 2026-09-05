import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { UpgradeDocumentSchema } from "axm.sh/specification-harness";
import { LOCAL_VERSION, TARGET_VERSION, runUpgrade } from "../../support/upgrade-harness.js";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "cli/upgrade/machine-result-is-upgrade-assessment",
  title: "Machine upgrade emits one complete assessment",
  statement:
    "When upgrade reports an assessment in machine mode, AXM shall emit exactly one axm.upgrade-assessment/v1 result that separately records intent, platform, ownership, canonical selection, installer availability, target, mutation, verification, recovery, command evidence, and disposition.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["contract", "example"],
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
  for (const scenario of [
    { name: "applied", options: {}, outcome: "applied", disposition: "upgraded" },
    { name: "preview", options: { preview: true }, outcome: "previewed", disposition: "previewed" },
    {
      name: "current",
      options: { localVersion: TARGET_VERSION },
      outcome: "no-op",
      disposition: "already-current",
    },
    {
      name: "installer lag",
      options: { formulaVersion: LOCAL_VERSION },
      outcome: "failed",
      disposition: "installer-lagging",
    },
  ])
    it.effect(`emits one complete assessment for ${scenario.name}`, () =>
      Effect.gen(function* () {
        const result = yield* runUpgrade(scenario.options);
        expect(result.stdout.trim()).not.toBe("");
        // Parsing the complete stdout rejects multiple documents or non-JSON output;
        // parsing one renderer write would miss additional documents and split writes.
        const emitted: unknown = JSON.parse(result.stdout);
        const document = yield* Schema.decodeUnknownEffect(UpgradeDocumentSchema)(emitted);
        expect(document.result).toMatchObject({
          contract: "axm.upgrade-assessment/v1",
          outcome: scenario.outcome,
          disposition: scenario.disposition,
        });
        expect(emitted).toEqual(result.document);
      }),
    );
});
