import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { ListExtensions } from "./list-extensions.js";
import { makeInstalledSkillFixture } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/list/ordinary-inventory-identifies-deprecation",
  title: "Ordinary listings identify deprecation without its detail",
  statement:
    "When an ordinary inventory includes a deprecated installation, AXM shall identify its deprecation status and shall not carry the deprecation detail that the deprecation listing reports.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "apps/cli/src/root/list/command.test.ts",
    "packages/core/workspace-inspection/src/extension-list/list-extensions.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Deprecation in ordinary inventories", () => {
  it.effect("identifies the deprecated installation and summarizes its detail away", () => {
    const fixture = makeInstalledSkillFixture({
      index: {
        versions: [{ version: "1.0.0", published: "2026-01-01T00:00:00.000Z" }],
        deprecation: {
          deprecatedAt: "2026-03-01T00:00:00.000Z",
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
            items: [{ name: "review", assessment: { state: "deprecated" } }],
          });
          expect(result.document.items[0]?.assessment.deprecation).toBeUndefined();
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });
});
