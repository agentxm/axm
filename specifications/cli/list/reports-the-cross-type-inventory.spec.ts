import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Schema from "effect/Schema";
import { handleList, ExtensionListDocumentSchema } from "axm.sh/specification-harness";
import { makeReadSpecWorkspace } from "../../support/read-harness.js";

export const specification = defineSpecification({
  requirement: "cli/list/reports-the-cross-type-inventory",
  title: "List reports the current inventory across extension types",
  statement:
    "When listing extensions, AXM shall report the current local inventory across all extension types or only the explicitly selected type, including configured extensions that are disabled or missing.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["apps/cli/src/root/list/command.test.ts", "apps/cli/src/root/list/command.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Cross-type local inventory", () => {
  it.effect(
    "distinguishes configured, enabled, and installed state while filtering by type",
    () => {
      const workspace = makeReadSpecWorkspace({
        settings: {
          skills: { review: { source: "@acme/skills/review", enabled: false } },
          hooks: { audit: { source: "@acme/hooks/audit", enabled: true } },
        },
      });
      return workspace.provide(
        Effect.gen(function* () {
          const read = () =>
            Schema.decodeUnknownSync(Schema.toType(ExtensionListDocumentSchema))(
              workspace.rendererState.results.at(-1)?.data,
            );
          yield* handleList({ type: Option.none(), outdated: false, deprecated: false });
          expect(read()).toMatchObject({ filter: "all", count: 2, totalCount: 2 });
          expect(read().items).toEqual(
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
          yield* handleList({ type: Option.some("skill"), outdated: false, deprecated: false });
          expect(read()).toMatchObject({ count: 1, items: [{ type: "skill", name: "review" }] });
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
      );
    },
  );
  it.effect("keeps all seven extension types distinct and selects each type independently", () => {
    const workspace = makeReadSpecWorkspace({
      settings: {
        skills: { example: { source: "@acme/skills/example", enabled: false } },
        mcps: { example: { source: "@acme/mcps/example", enabled: true } },
        subagents: { example: { source: "@acme/subagents/example", enabled: true } },
        rules: { example: { source: "@acme/rules/example", enabled: true } },
        hooks: { example: { source: "@acme/hooks/example", enabled: true } },
        knowledge: { example: { source: "@acme/knowledge/example", enabled: true } },
        packs: { example: { source: "@acme/packs/example", enabled: true } },
      },
    });
    // Repeated names ensure inventory identity includes the extension type.
    // Missing canonical packages keep this a local desired-state read control.
    const expected = [
      { type: "skill", enabled: false },
      { type: "mcp-server", enabled: true },
      { type: "subagent", enabled: true },
      { type: "rule", enabled: true },
      { type: "hook", enabled: true },
      { type: "knowledge", enabled: true },
      { type: "pack", enabled: true },
    ] as const;
    return workspace.provide(
      Effect.gen(function* () {
        const read = () =>
          Schema.decodeUnknownSync(Schema.toType(ExtensionListDocumentSchema))(
            workspace.rendererState.results.at(-1)?.data,
          );
        yield* handleList({ type: Option.none(), outdated: false, deprecated: false });
        const all = read();
        expect(all).toMatchObject({
          filter: "all",
          count: expected.length,
          totalCount: expected.length,
        });
        expect(all.items.map((item) => item.type).sort()).toEqual(
          expected.map((item) => item.type).sort(),
        );
        for (const row of expected) {
          expect(all.items.find((item) => item.type === row.type)).toMatchObject({
            ...row,
            name: "example",
            management: "configured",
            installed: false,
          });
          yield* handleList({ type: Option.some(row.type), outdated: false, deprecated: false });
          const selected = read();
          expect(selected.count).toBe(1);
          expect(selected.items).toEqual([
            expect.objectContaining({
              ...row,
              name: "example",
              management: "configured",
              installed: false,
            }),
          ]);
        }
      }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
    );
  });
});
