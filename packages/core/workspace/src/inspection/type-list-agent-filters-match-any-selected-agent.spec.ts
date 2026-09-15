import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { makeInspectionFixture } from "./testing.js";
import { listSkills, listSubagents, type TypeListRow } from "./type-list/type-lists.js";

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
    "apps/cli/src/root/skills/list.test.ts",
    "apps/cli/src/root/subagents/list/handler.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const document = (name: string) =>
  `---\nname: ${name}\ndescription: Fixture guidance\n---\n# ${name}\n`;

describe("Agent-selected inventories", () => {
  for (const type of ["skill", "subagent"] as const)
    it.effect(type, () => {
      const files =
        type === "skill"
          ? {
              ".claude/skills/claude-only/SKILL.md": document("claude-only"),
              ".cursor/skills/cursor-only/SKILL.md": document("cursor-only"),
            }
          : {
              ".claude/agents/claude-only.md": document("claude-only"),
              ".cursor/agents/cursor-only.md": document("cursor-only"),
            };
      const fixture = makeInspectionFixture({
        settings: { agents: ["claude-code", "cursor"] },
        files,
      });
      const read = (agents: ReadonlyArray<string>) =>
        type === "skill" ? listSkills({ agents }) : listSubagents({ agents });
      const names = (rows: ReadonlyArray<TypeListRow>) => rows.map((row) => row.name);
      return fixture
        .provide(
          Effect.gen(function* () {
            const claude = yield* read(["claude-code"]);
            expect(names(claude.rows)).toContain("claude-only");
            expect(names(claude.rows)).not.toContain("cursor-only");
            const either = yield* read(["claude-code", "cursor"]);
            expect(names(either.rows)).toEqual(
              expect.arrayContaining(["claude-only", "cursor-only"]),
            );
            const none = yield* read(["not-an-observed-agent"]);
            expect(none.rows).toEqual([]);
            expect(none.inventory.count).toBe(0);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
    });
});
