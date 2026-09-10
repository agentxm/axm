import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { defineSpecification } from "@agentxm/specification-metadata";

import { ShowPack } from "./show-pack.js";
import { makeAuthoredPackFixture } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/packs/show/rejects-mismatched-and-unavailable-packs",
  title: "Pack inspection refuses mismatched and unavailable targets",
  statement:
    "When the requested target is not a configured pack, is not a pack identity, names another owner's pack, or its canonical manifest is unavailable or malformed, AXM shall refuse the inspection and produce no pack state.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/core/workspace-inspection/src/packs/show-pack.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Pack target and manifest validation", () => {
  for (const row of [
    { label: "absent target", target: "absent", reason: "not-configured", damage: "none" },
    {
      label: "wrong-type identity",
      target: "@acme/skills/toolkit",
      reason: "not-a-pack-identity",
      damage: "none",
    },
    {
      label: "foreign-owner identity",
      target: "@other/packs/toolkit",
      reason: "identity-mismatch",
      damage: "none",
    },
    {
      label: "missing manifest",
      target: "toolkit",
      reason: "manifest-unavailable",
      damage: "missing",
    },
    {
      label: "malformed manifest",
      target: "toolkit",
      reason: "manifest-unreadable",
      damage: "malformed",
    },
  ] as const)
    it.effect(row.label, () => {
      const fixture = makeAuthoredPackFixture();
      if (row.damage === "missing") fixture.remove("packs/toolkit/pack.json");
      if (row.damage === "malformed") fixture.writeFile("packs/toolkit/pack.json", "{broken");
      return fixture
        .provide(
          Effect.gen(function* () {
            const result = yield* Effect.result(ShowPack.query({ target: row.target }));
            expect(Result.isFailure(result)).toBe(true);
            if (Result.isFailure(result) && result.failure._tag === "PackInspectionRefused")
              expect(result.failure.reason).toBe(row.reason);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
    });
});
