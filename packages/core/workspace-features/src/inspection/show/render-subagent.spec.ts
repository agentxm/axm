import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { defineSpecification } from "@agentxm/specification-metadata";
import { RenderSubagent, SubagentRenderResultSchema } from "../index.js";
import { makeInspectionFixture } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/subagents/show/renders-selected-runtime-without-mutation",
  title: "Subagent render inspection compiles one runtime without writing state",
  statement:
    "When subagents show selects --render for a catalog runtime, AXM shall compile the package's selected implementation for that runtime and scope, even if the runtime is not configured, reporting its mode, native identity, source dependencies, output paths and complete output content. Unsupported placement or implementation shall be reported explicitly. Render inspection shall not change package content, configuration, lock state, receipts or native files.",
  class: "functional",
  role: "interface",
  goals: [
    "agent-interoperability",
    "actionable-diagnostics",
    "machine-automation",
    "safe-repetition",
  ],
  methods: ["example", "decision-table"],
  boundary: "memory",
  boundaryRationale:
    "The query runs with real canonical files and workspace services; complete before/after snapshots observe read-only behavior without process or network effects.",
  derivedFrom: ["cli/type-shows-report-source-and-version"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Subagent render inspection", () => {
  for (const agentId of ["claude-code", "cursor", "windsurf", "chatgpt"] as const)
    it.effect(`renders or explicitly refuses unconfigured ${agentId}`, () => {
      const fixture = makeInspectionFixture({
        settings: {
          owner: "@acme",
          agents: [],
          subagents: { reviewer: { source: "workspace", enabled: false } },
        },
        files: {
          "subagents/reviewer/subagent.json": JSON.stringify({
            owner: "@acme",
            type: "subagent",
            name: "reviewer",
            version: "1.0.0",
            description: "Portable review",
            core: { instructions: "core.md" },
            implementations: { cursor: { kind: "native", source: "cursor.md" } },
          }),
          "subagents/reviewer/core.md": "Portable instructions.\n",
          "subagents/reviewer/cursor.md":
            "---\nname: native-reviewer\ndescription: Native review\n---\n\nDifferent native instructions.\n",
        },
      });
      const before = fixture.snapshot();
      return fixture
        .provide(
          Effect.gen(function* () {
            const result = yield* RenderSubagent.query({ name: "reviewer", agentId });
            expect(Schema.is(SubagentRenderResultSchema)(result)).toBe(true);
            expect(result.agentId).toBe(agentId);
            expect(result).toMatchObject({
              type: "subagent",
              version: "1.0.0",
              enabled: false,
              source: "workspace",
            });
            expect(result.fqn).toBe("@acme/subagents/reviewer");
            if (agentId === "windsurf" || agentId === "chatgpt") {
              expect(result.status).toBe("unsupported");
              if (result.status !== "unsupported") return;
              expect(result.reasonCode).toBeTruthy();
              expect(result.artifacts).toEqual([]);
            } else {
              expect(result.status).toBe("rendered");
              if (result.status !== "rendered") return;
              expect(result.mode).toBe(agentId === "cursor" ? "native" : "portable");
              expect(result.nativeName).toBe(agentId === "cursor" ? "native-reviewer" : "reviewer");
              expect(result.sourceDependencies).toContain(
                agentId === "cursor" ? "cursor.md" : "core.md",
              );
              expect(result.artifacts).toHaveLength(1);
              expect(result.artifacts[0]?.content).toContain(
                agentId === "cursor" ? "Different native instructions." : "Portable instructions.",
              );
              expect(result.artifacts[0]?.path).toBe(
                agentId === "cursor"
                  ? ".cursor/agents/native-reviewer.md"
                  : ".claude/agents/reviewer.md",
              );
            }
            expect(fixture.snapshot()).toEqual(before);
            expect(fixture.requests).toEqual([]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
    });
});
