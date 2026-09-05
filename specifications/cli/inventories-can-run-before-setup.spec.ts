import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  handleList,
  handleSkillsList,
  handleListSubagents,
  handleListRule,
  handleListHook,
  handlePacksList,
  handleListMcpServers,
  handleKnowledgeList,
} from "axm.sh/specification-harness";
import { makeUninitializedReadSpecContext } from "../support/read-harness.js";

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
    "packages/cli/src/root/skills/list.internal.test.ts",
    "packages/cli/src/root/list/command.ts",
    "packages/cli/src/root/knowledge/list.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Local inventory before setup", () => {
  const rows = [
    {
      label: "root list",
      read: () => handleList({ type: Option.none(), outdated: false, deprecated: false }),
    },
    { label: "skills list", read: () => handleSkillsList({ agents: [] }) },
    { label: "subagents list", read: () => handleListSubagents({ agents: [] }) },
    { label: "rules list", read: handleListRule },
    { label: "hooks list", read: handleListHook },
    { label: "packs list", read: handlePacksList },
    { label: "mcps list", read: handleListMcpServers },
    { label: "knowledge list", read: handleKnowledgeList },
  ];
  for (const row of rows)
    it.effect(row.label, () => {
      const context = makeUninitializedReadSpecContext();
      return context.provide(
        Effect.gen(function* () {
          yield* row.read();
          expect(context.rendererState.results.at(-1)?.data).toMatchObject({ items: [], count: 0 });
          expect(fs.existsSync(path.join(context.root, "axm.json"))).toBe(false);
          expect(fs.existsSync(path.join(context.root, "axm-lock.yaml"))).toBe(false);
        }).pipe(Effect.ensuring(Effect.sync(context.cleanup))),
      );
    });
  it.effect("finds a native skill without taking ownership", () => {
    const context = makeUninitializedReadSpecContext();
    const file = path.join(context.root, ".agents/skills/native-only/SKILL.md");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "---\nname: native-only\ndescription: Native guidance\n---\n# Native\n");
    return context.provide(
      Effect.gen(function* () {
        yield* handleSkillsList({ agents: [] });
        expect(context.rendererState.results.at(-1)?.data).toMatchObject({
          count: 1,
          unmanagedCount: 1,
          installedCount: 1,
          items: [
            { name: "native-only", classification: { kind: "lifecycle", lifecycle: "unmanaged" } },
          ],
        });
        expect(fs.existsSync(path.join(context.root, "axm.json"))).toBe(false);
        expect(fs.existsSync(path.join(context.root, "axm-lock.yaml"))).toBe(false);
        expect(fs.readFileSync(file, "utf8")).toContain("# Native");
      }).pipe(Effect.ensuring(Effect.sync(context.cleanup))),
    );
  });
});
