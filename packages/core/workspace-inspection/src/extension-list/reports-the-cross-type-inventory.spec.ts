import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { ListExtensions } from "./list-extensions.js";
import { makeInspectionFixture } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/list/reports-the-cross-type-inventory",
  title: "List reports the current inventory across extension types",
  statement:
    "When listing extensions, AXM shall report the current local inventory across all extension types or only the explicitly selected type, including configured extensions that are disabled or missing.",
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

describe("Cross-type local inventory", () => {
  it.effect(
    "distinguishes configured, enabled, and installed state while filtering by type",
    () => {
      const fixture = makeInspectionFixture({
        settings: {
          skills: { review: { source: "@acme/skills/review", enabled: false } },
          hooks: { audit: { source: "@acme/hooks/audit", enabled: true } },
        },
      });
      return fixture
        .provide(
          Effect.gen(function* () {
            const all = yield* ListExtensions.query({ filter: "all" });
            expect(all.document).toMatchObject({ filter: "all", count: 2, totalCount: 2 });
            expect(all.document.items).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  type: "skill",
                  name: "review",
                  management: "configured",
                  enabled: false,
                  installed: false,
                }),
                expect.objectContaining({
                  type: "hook",
                  name: "audit",
                  management: "configured",
                  enabled: true,
                  installed: false,
                }),
              ]),
            );
            const skills = yield* ListExtensions.query({ type: "skill", filter: "all" });
            expect(skills.document).toMatchObject({
              count: 1,
              items: [{ type: "skill", name: "review" }],
            });
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
    },
  );

  // Supporting coverage: repeated names prove inventory identity includes the type.
  it.effect("keeps all seven extension types distinct and selects each type independently", () => {
    const fixture = makeInspectionFixture({
      settings: {
        skills: { example: { source: "@acme/skills/example", enabled: false } },
        mcpServers: { example: { source: "@acme/mcps/example", enabled: true } },
        subagents: { example: { source: "@acme/subagents/example", enabled: true } },
        rules: { example: { source: "@acme/rules/example", enabled: true } },
        hooks: { example: { source: "@acme/hooks/example", enabled: true } },
        knowledge: { example: { source: "@acme/knowledge/example", enabled: true } },
        packs: { example: { source: "@acme/packs/example", enabled: true } },
      },
    });
    const expected = [
      { type: "skill", enabled: false },
      { type: "mcp-server", enabled: true },
      { type: "subagent", enabled: true },
      { type: "rule", enabled: true },
      { type: "hook", enabled: true },
      { type: "knowledge", enabled: true },
      { type: "pack", enabled: true },
    ] as const;
    return fixture
      .provide(
        Effect.gen(function* () {
          const all = yield* ListExtensions.query({ filter: "all" });
          expect(all.document).toMatchObject({
            filter: "all",
            count: expected.length,
            totalCount: expected.length,
          });
          expect(all.document.items.map((item) => item.type).sort()).toEqual(
            expected.map((item) => item.type).sort(),
          );
          for (const row of expected) {
            expect(all.document.items.find((item) => item.type === row.type)).toMatchObject({
              ...row,
              name: "example",
              management: "configured",
              installed: false,
            });
            const selected = yield* ListExtensions.query({ type: row.type, filter: "all" });
            expect(selected.document.count).toBe(1);
            expect(selected.document.items).toEqual([
              expect.objectContaining({
                ...row,
                name: "example",
                management: "configured",
                installed: false,
              }),
            ]);
          }
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });
});
