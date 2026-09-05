import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Schema from "effect/Schema";
import {
  handleSkillsList,
  handleListSubagents,
  handleListRule,
  handleListHook,
  handlePacksList,
  ExtensionInventorySchema,
  handleInstall,
} from "axm.sh/specification-harness";
import { authoringTypes } from "../support/authoring-fixtures.js";
import { createNewExtension } from "../support/new-extension-fixture.js";
import { makeSpecRegistry } from "../support/registry-fixture.js";
import { makeReadSpecWorkspace } from "../support/read-harness.js";

export const specification = defineSpecification({
  requirement: "cli/type-lists-report-local-state",
  title: "Type inventories report local extension state",
  statement:
    "When listing skills, subagents, rules, hooks, or packs, AXM shall report the selected type\u2019s current local entries with their management classification, installation state, and source observation.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/src/root/skills/list.internal.test.ts",
    "packages/cli/src/root/subagents/list/handler.internal.test.ts",
    "packages/cli/src/root/packs/list.internal.test.ts",
    "packages/cli/src/root/hooks/list.ts",
    "packages/cli/src/root/rules/list.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Type-specific inventory", () => {
  const rows = [
    { type: "skill", read: () => handleSkillsList({ agents: [] }) },
    { type: "subagent", read: () => handleListSubagents({ agents: [] }) },
    { type: "rule", read: handleListRule },
    { type: "hook", read: handleListHook },
    { type: "pack", read: handlePacksList },
  ] as const;
  for (const row of rows)
    it.effect(row.type, () => {
      const workspace = makeReadSpecWorkspace({ settings: { agents: ["claude-code"] } });
      return workspace.provide(
        Effect.gen(function* () {
          const fixture = authoringTypes.find((candidate) => candidate.type === row.type);
          if (fixture === undefined) throw new Error("Missing type fixture");
          yield* createNewExtension(fixture, "example");
          workspace.rendererState.results.length = 0;
          yield* row.read();
          const result = Schema.decodeUnknownSync(Schema.toType(ExtensionInventorySchema))(
            workspace.rendererState.results[0]?.data,
          );
          expect(result).toMatchObject({
            count: 1,
            configuredCount: 1,
            installedCount: 1,
            items: [
              {
                name: "example",
                type: row.type,
                classification: { kind: "lifecycle", lifecycle: "configured" },
                installed: true,
              },
            ],
          });
          expect(result.items[0]?.paths.length).toBeGreaterThan(0);
          if (row.type !== "pack") expect(result.items[0]?.enabled).toBe(true);
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
      );
    });
  it.effect("keeps a configured but absent disabled skill in the inventory", () => {
    const workspace = makeReadSpecWorkspace({
      settings: { skills: { absent: { source: "@acme/skills/absent", enabled: false } } },
    });
    return workspace.provide(
      Effect.gen(function* () {
        yield* handleSkillsList({ agents: [] });
        expect(workspace.rendererState.results.at(-1)?.data).toMatchObject({
          count: 1,
          configuredCount: 1,
          installedCount: 0,
          items: [{ name: "absent", enabled: false, installed: false }],
        });
      }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
    );
  });
  it.effect("reports an accepted Registry pack’s owner and version", () => {
    const registry = makeSpecRegistry();
    registry.writePack("toolkit", [{ version: "2.3.4", dependencies: {} }]);
    const workspace = makeReadSpecWorkspace({ settings: { sources: [registry.source] } });
    return workspace.provide(
      Effect.gen(function* () {
        yield* handleInstall({
          source: Option.some("@acme/packs/toolkit@2.3.4"),
          preview: false,
          force: false,
        });
        yield* handlePacksList();
        expect(
          Schema.decodeUnknownSync(Schema.toType(ExtensionInventorySchema))(
            workspace.rendererState.results.at(-1)?.data,
          ),
        ).toMatchObject({
          count: 1,
          items: [
            {
              name: "toolkit",
              owner: "@acme",
              version: "2.3.4",
              source: registry.source.name,
              installed: true,
            },
          ],
        });
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            workspace.cleanup();
            registry.cleanup();
          }),
        ),
      ),
    );
  });
});
