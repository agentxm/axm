import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";
import { NativePlatformTest } from "@agentxm/workspace-kernel/locations/testing";
import { LocalInspection } from "../index.js";
import { makeAuthoredPackFixture } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/show/keeps-incomplete-pack-evidence",
  title: "Incomplete Pack observations retain justified local facts",
  statement:
    "When a configured Pack manifest is absent or malformed, local inspection shall retain established identity, declarations, editing authority and accepted facts while reporting incomplete membership and observation coverage.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  boundary: "platform",
  boundaryRationale:
    "Production workspace services observe a damaged authored Pack manifest without acquiring or rewriting content.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});
describe("Incomplete Pack evidence", () => {
  for (const damage of ["absent", "malformed"])
    it.effect(damage, () => {
      const fixture = makeAuthoredPackFixture();
      if (damage === "absent") fixture.remove("packs/toolkit/pack.json");
      else fixture.writeFile("packs/toolkit/pack.json", "{broken");
      return fixture
        .provide(
          Effect.gen(function* () {
            const result = yield* LocalInspection.query({
              selection: { kind: "identities", identities: ["toolkit"] },
              types: ["pack"],
            });
            expect(result.requests[0]?.code).toBe(0);
            expect(result.items[0]).toMatchObject({
              editing: { kind: "authored-source" },
              desired: { state: "reached", direct: true, coverage: { state: "partial" } },
              accepted: { state: "not-applicable" },
              observed: { coverage: { state: "partial" } },
            });
            expect(result.observationDiagnostics.length).toBeGreaterThan(0);
          }),
        )
        .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
    });
});
