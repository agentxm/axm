import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { ListExtensions } from "./extension-list/list-extensions.js";
import { makeInspectionFixture } from "./testing.js";
import {
  listHooks,
  listMcpServers,
  listPacks,
  listRules,
  listSkills,
  listSubagents,
} from "./type-list/type-lists.js";

export const specification = defineSpecification({
  requirement: "cli/inventories-can-run-before-setup",
  title: "Local inventories can run before setup",
  statement:
    "When listing local extensions before workspace setup, AXM shall report detected entries or an empty inventory without requiring or creating workspace settings and resolution state.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "apps/cli/src/root/skills/list.test.ts",
    "packages/core/workspace-inspection/src/extension-list/list-extensions.ts",
    "packages/core/workspace-inspection/src/type-list/type-lists.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/** An uninitialized workspace: no settings, no accepted resolution state. */
const uninitialized = () => makeInspectionFixture();

describe("Local inventory before setup", () => {
  it.effect("root list reports an empty inventory and writes nothing", () => {
    const fixture = uninitialized();
    return fixture
      .provide(
        Effect.gen(function* () {
          const result = yield* ListExtensions.query({ filter: "all" });
          expect(result.document).toMatchObject({ items: [], count: 0, totalCount: 0 });
          expect(fixture.exists("axm.json")).toBe(false);
          expect(fixture.exists("axm-lock.yaml")).toBe(false);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });

  it.effect("finds a native skill without taking ownership", () => {
    const fixture = uninitialized();
    fixture.writeFile(
      ".agents/skills/native-only/SKILL.md",
      "---\nname: native-only\ndescription: Native guidance\n---\n# Native\n",
    );
    return fixture
      .provide(
        Effect.gen(function* () {
          const { inventory } = yield* listSkills({});
          expect(inventory).toMatchObject({
            count: 1,
            unmanagedCount: 1,
            installedCount: 1,
            items: [
              {
                name: "native-only",
                classification: { kind: "lifecycle", lifecycle: "unmanaged" },
              },
            ],
          });
          expect(fixture.exists("axm.json")).toBe(false);
          expect(fixture.exists("axm-lock.yaml")).toBe(false);
          expect(fixture.readFile(".agents/skills/native-only/SKILL.md")).toContain("# Native");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });

  // Supporting coverage: every per-type inventory answers the same way.
  const perType = [
    { label: "skills list", read: () => listSkills({}) },
    { label: "subagents list", read: () => listSubagents({}) },
    { label: "rules list", read: () => listRules() },
    { label: "hooks list", read: () => listHooks() },
    { label: "packs list", read: () => listPacks() },
    { label: "mcps list", read: () => listMcpServers() },
  ];
  for (const row of perType)
    it.effect(row.label, () => {
      const fixture = uninitialized();
      return fixture
        .provide(
          Effect.gen(function* () {
            const { inventory } = yield* row.read();
            expect(inventory).toMatchObject({ items: [], count: 0 });
            expect(fixture.exists("axm.json")).toBe(false);
            expect(fixture.exists("axm-lock.yaml")).toBe(false);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
    });
});
