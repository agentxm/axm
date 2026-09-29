import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";
import { WorkspaceCatalog } from "@agentxm/workspace-kernel/sources";
import { applySync, makeSyncFixture } from "../testing/sync-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/sync/unreadable-agent-configuration-prevents-reconciliation",
  title: "Unreadable agent configuration prevents reconciliation",
  statement:
    "When an agent skill-directory configuration source cannot be read, or an agent's native MCP configuration file cannot be decoded as the configuration its format requires, AXM shall report the configuration failure before changing workspace or agent files, without treating the agent's outputs as absent or already reconciled.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition", "actionable-diagnostics"],
  methods: ["decision-table", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "A JSON MCP configuration whose root is an array is the smallest file that parses but is not the map the format requires, so it stands for every undecodable native MCP configuration.",
  ],
  openQuestions: [],
});

describe("Agent configuration failure", () => {
  it.effect.each([
    { agent: "claude-code", key: "AXM_CLAUDE_SKILLS_DIR" },
    { agent: "gemini-cli", key: "AXM_GEMINI_CLI_SKILLS_DIR" },
  ])("blocks $agent reconciliation and catalog lookup without changing files", ({ agent, key }) => {
    const sourceError = new ConfigProvider.SourceError({ message: "source unavailable" });
    const workspace = makeSyncFixture({
      settings: { owner: "@acme", agents: [agent] },
      files: { ".claude/skills/keep/SKILL.md": "Keep this user-authored content." },
      configureConfigProvider: (original) =>
        ConfigProvider.make((path) =>
          path[0] === key ? Effect.fail(sourceError) : original.load(path),
        ),
    });
    return Effect.gen(function* () {
      const before = workspace.snapshot();
      const homeBefore = workspace.homeSnapshot();
      const failure = yield* workspace.provide(applySync()).pipe(Effect.flip);
      expect(failure).toMatchObject({ _tag: "ConfigError", cause: sourceError });
      const catalogFailure = yield* workspace
        .provide(Effect.flatMap(WorkspaceCatalog, (catalog) => catalog.skillCandidates))
        .pipe(Effect.flip);
      expect(catalogFailure).toMatchObject({ _tag: "ConfigError", cause: sourceError });
      expect(workspace.snapshot()).toEqual(before);
      expect(workspace.homeSnapshot()).toEqual(homeBefore);
    }).pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
  });

  it.effect(
    "blocks reconciliation of an MCP server whose native file is not a configuration map",
    () => {
      const workspace = makeSyncFixture({
        settings: {
          owner: "@acme",
          agents: ["claude-code"],
          mcpServers: { demo: { command: "node", args: ["server.js"] } },
        },
        files: { ".mcp.json": "[]\n" },
      });
      return workspace
        .provide(
          Effect.gen(function* () {
            const before = workspace.snapshot();
            const failure = yield* applySync().pipe(Effect.flip);
            expect(failure).toMatchObject({ _tag: "McpConfigInvalid" });
            expect(workspace.snapshot()).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
    },
  );
});
