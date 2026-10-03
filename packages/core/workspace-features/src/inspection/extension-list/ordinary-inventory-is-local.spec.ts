import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { ListExtensions } from "../index.js";
import { makeInstalledSkillFixture } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/list/ordinary-inventory-is-local",
  title: "Ordinary listings report local state without registry assessment",
  statement:
    "When an ordinary inventory is requested, AXM shall report the local inventory without consulting remote sources, with assessment not checked and without remote coverage or deprecation detail.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "apps/cli/src/root/list/command.test.ts",
    "packages/core/workspace-features/src/inspection/extension-list/list-extensions.ts",
  ],
  supersedes: ["cli/list/ordinary-inventory-identifies-deprecation"],
  assumptions: [],
  openQuestions: [],
});

describe("Local ordinary inventories", () => {
  it.effect("reports local state without assessing a deprecated installation", () => {
    const fixture = makeInstalledSkillFixture({
      index: {
        versions: [{ version: "1.0.0", published: "2026-01-01T00:00:00.000Z" }],
        deprecation: {
          deprecatedAt: "2026-03-01T00:00:00.000Z",
          reason: "other",
          message: "Use the replacement.",
        },
      },
    });
    return fixture
      .provide(
        Effect.gen(function* () {
          const result = yield* ListExtensions.query({ filter: "all" });
          expect(result.document).toMatchObject({
            filter: "all",
            items: [{ name: "review", assessment: { state: "not-checked" } }],
          });
          expect(result.document.items[0]?.assessment.deprecation).toBeUndefined();
          expect(result.document.coverage).toBeUndefined();
          expect(fixture.requests).toEqual([]);
          const typed = yield* ListExtensions.query({ filter: "all", type: "skill" });
          expect(typed.document.items).toEqual(result.document.items);
          expect(fixture.requests).toEqual([]);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });
});
