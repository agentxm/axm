import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { ListExtensions } from "./list-extensions.js";
import { makeInstalledSkillFixture } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/list/reports-deprecation-guidance",
  title: "Deprecation listings report available replacement guidance",
  statement:
    "When listing deprecated installations, AXM shall return the Registry\u2019s deprecation message and replacement availability for each matching installation.",
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

describe("Installation deprecation guidance", () => {
  for (const row of [
    {
      label: "message and visible replacement",
      guidance: {
        message: "Use the replacement.",
        replacement: { status: "available", fqn: "@acme/skills/replacement" },
      },
    },
    {
      label: "message and unavailable replacement",
      guidance: {
        message: "Use the replacement when available.",
        replacement: { status: "unavailable" },
      },
    },
    { label: "message only", guidance: { message: "This extension is no longer maintained." } },
    {
      label: "replacement only",
      guidance: { replacement: { status: "available", fqn: "@acme/skills/replacement" } },
    },
  ])
    it.effect(row.label, () => {
      const fixture = makeInstalledSkillFixture({
        index: {
          versions: [{ version: "1.0.0", published: "2026-01-01T00:00:00.000Z" }],
          deprecation: { deprecatedAt: "2026-03-01T00:00:00.000Z", ...row.guidance },
        },
      });
      return fixture
        .provide(
          Effect.gen(function* () {
            const result = yield* ListExtensions.query({ filter: "deprecated" });
            expect(result.document).toMatchObject({
              filter: "deprecated",
              count: 1,
              coverage: { eligible: 1, checked: 1, unknown: 0 },
              items: [
                { name: "review", assessment: { state: "deprecated", deprecation: row.guidance } },
              ],
            });
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
    });
});
