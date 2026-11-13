import { NativePlatformTest } from "@agentxm/workspace-kernel/locations/testing";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { LocalInspection } from "../index.js";
import { makeAuthoredPackFixture } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/packs/show/rejects-mismatched-and-unavailable-packs",
  title: "Pack inspection refuses identity mismatches and preserves incomplete local facts",
  statement:
    "Local Pack inspection shall refuse unmatched or conflicting identities without describing a different Pack, while retaining justified local facts with incomplete coverage when the matching Pack manifest is unavailable or malformed.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  boundaryRationale:
    "Production workspace services execute over native temporary files and directories; the default examples observe their state and outcomes without a separate CLI process.",
  boundary: "platform",
  methods: ["example"],
  derivedFrom: ["packages/core/workspace-features/src/inspection/packs/pack-members.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Pack target and manifest validation", () => {
  for (const row of [
    { label: "absent target", target: "absent", code: 3, damage: "none" },
    { label: "wrong-type identity", target: "@acme/skills/toolkit", code: 3, damage: "none" },
    { label: "foreign-owner identity", target: "@other/packs/toolkit", code: 3, damage: "none" },
    { label: "missing manifest", target: "toolkit", code: 0, damage: "missing" },
    { label: "malformed manifest", target: "toolkit", code: 0, damage: "malformed" },
    { label: "different manifest identity", target: "toolkit", code: 6, damage: "identity" },
  ])
    it.effect(row.label, () => {
      const fixture = makeAuthoredPackFixture();
      if (row.damage === "missing") fixture.remove("packs/toolkit/pack.json");
      if (row.damage === "malformed") fixture.writeFile("packs/toolkit/pack.json", "{broken");
      if (row.damage === "identity")
        fixture.writeFile(
          "packs/toolkit/pack.json",
          JSON.stringify({
            owner: "@other",
            name: "toolkit",
            type: "pack",
            version: "1.0.0",
            description: "Different package",
            dependencies: {},
          }),
        );
      return fixture
        .provide(
          Effect.gen(function* () {
            const result = yield* LocalInspection.query({
              selection: { kind: "identities", identities: [row.target] },
              types: ["pack"],
            });
            expect(result.requests[0]?.code).toBe(row.code);
            if (row.code === 0) {
              expect(result.items[0]?.identity.fqn).toBe("@acme/packs/toolkit");
              expect(result.items[0]?.observed.coverage.state).toBe("partial");
            } else expect(result.items).toEqual([]);
          }),
        )
        .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
    });
});
