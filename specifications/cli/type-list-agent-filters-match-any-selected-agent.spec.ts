import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as fs from "node:fs";
import * as path from "node:path";
import * as Schema from "effect/Schema";
import {
  handleSkillsList,
  handleListSubagents,
  ExtensionInventorySchema,
} from "axm.sh/specification-harness";
import { makeReadSpecWorkspace } from "../support/read-harness.js";

export const specification = defineSpecification({
  requirement: "cli/type-list-agent-filters-match-any-selected-agent",
  title: "Agent filters match any selected agent",
  statement:
    "When filtering skill or subagent inventories by agents, AXM shall include entries observed by any selected agent and exclude entries observed by none of them.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/src/root/skills/list.internal.test.ts",
    "packages/cli/src/root/subagents/list/handler.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Agent-selected inventories", () => {
  for (const type of ["skill", "subagent"] as const)
    it.effect(type, () => {
      const workspace = makeReadSpecWorkspace({ settings: { agents: ["claude-code", "cursor"] } });
      const write = (relative: string, name: string) => {
        const file = path.join(workspace.root, relative);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(
          file,
          `---\nname: ${name}\ndescription: Fixture guidance\n---\n# ${name}\n`,
        );
      };
      if (type === "skill") {
        write(".claude/skills/claude-only/SKILL.md", "claude-only");
        write(".cursor/skills/cursor-only/SKILL.md", "cursor-only");
      } else {
        write(".claude/agents/claude-only.md", "claude-only");
        write(".cursor/agents/cursor-only.md", "cursor-only");
      }
      const read = (agents: ReadonlyArray<string>) =>
        type === "skill" ? handleSkillsList({ agents }) : handleListSubagents({ agents });
      return workspace.provide(
        Effect.gen(function* () {
          yield* read(["claude-code"]);
          const first = Schema.decodeUnknownSync(Schema.toType(ExtensionInventorySchema))(
            workspace.rendererState.results.at(-1)?.data,
          );
          expect(first.items.map((item) => item.name)).toContain("claude-only");
          expect(first.items.map((item) => item.name)).not.toContain("cursor-only");
          yield* read(["claude-code", "cursor"]);
          const either = Schema.decodeUnknownSync(Schema.toType(ExtensionInventorySchema))(
            workspace.rendererState.results.at(-1)?.data,
          );
          expect(either.items.map((item) => item.name)).toEqual(
            expect.arrayContaining(["claude-only", "cursor-only"]),
          );
          yield* read(["not-an-observed-agent"]);
          expect(workspace.rendererState.results.at(-1)?.data).toMatchObject({
            items: [],
            count: 0,
          });
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
      );
    });
});
