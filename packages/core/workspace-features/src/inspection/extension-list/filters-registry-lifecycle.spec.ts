import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import { expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { NativePlatformTest } from "@agentxm/workspace-kernel/locations/testing";
import { ListExtensions } from "./list-extensions.js";
import { makeInstalledSkillFixture } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/list/filters-registry-lifecycle",
  title: "Lifecycle listings distinguish archival and deprecation and combine them as a union",
  statement:
    "An explicitly requested archived or deprecated listing shall select installations carrying the corresponding Registry metadata, the combined lifecycle listing shall return each installation matching either status once, and every matching row shall preserve separate archival and deprecation metadata including available replacement guidance, without mutating the workspace.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  boundary: "platform",
  boundaryRationale:
    "Production inventory and Registry decoding inspect a temporary workspace through a recorded Registry port; a decision table covers independent and overlapping lifecycle states and verifies the workspace remains unchanged.",
  methods: ["decision-table"],
  derivedFrom: ["cli/list/reports-deprecation-guidance", "cli/list/ordinary-inventory-is-local"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const archival = { archivedAt: "2026-03-02T00:00:00.000Z", message: "Publication is closed." };
const deprecation = {
  deprecatedAt: "2026-03-01T00:00:00.000Z",
  reason: "superseded",
  message: "Use the replacement.",
  replacement: { status: "available", fqn: "@acme/skills/replacement" },
};

for (const state of [
  { name: "active", archived: false, deprecated: false, matches: [] },
  { name: "archived", archived: true, deprecated: false, matches: ["archived", "lifecycle"] },
  { name: "deprecated", archived: false, deprecated: true, matches: ["deprecated", "lifecycle"] },
  {
    name: "both",
    archived: true,
    deprecated: true,
    matches: ["archived", "deprecated", "lifecycle"],
  },
])
  for (const filter of ["archived", "deprecated", "lifecycle"] as const)
    it.effect(`${filter} selects ${state.name} metadata independently`, () => {
      const fixture = makeInstalledSkillFixture({
        index: {
          versions: [{ version: "1.0.0", published: "2026-01-01T00:00:00.000Z" }],
          ...(state.archived ? { archival } : {}),
          ...(state.deprecated ? { deprecation } : {}),
        },
      });
      return fixture
        .provide(
          Effect.gen(function* () {
            const before = fixture.snapshot();
            const result = yield* ListExtensions.query({ filter });
            expect(result.document).toMatchObject({
              filter,
              count: state.matches.includes(filter) ? 1 : 0,
              coverage: { eligible: 1, checked: 1, unknown: 0, notApplicable: 0 },
            });
            for (const item of result.document.items) {
              if (state.archived) {
                expect(item.assessment.archival?.message).toBe(archival.message);
                expect(
                  item.assessment.archival &&
                    DateTime.formatIso(item.assessment.archival.archivedAt),
                ).toBe(archival.archivedAt);
              } else expect(item.assessment.archival).toBeUndefined();
              if (state.deprecated)
                expect(item.assessment.deprecation).toMatchObject({
                  reason: deprecation.reason,
                  message: deprecation.message,
                  replacement: deprecation.replacement,
                });
              else expect(item.assessment.deprecation).toBeUndefined();
            }
            expect(fixture.requests).toHaveLength(1);
            expect(fixture.snapshot()).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
    });
