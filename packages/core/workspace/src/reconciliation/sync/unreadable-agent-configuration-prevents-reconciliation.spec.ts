import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";
import { WorkspaceCatalog } from "../../resolution/sources/index.js";
import { applySync, makeSyncFixture } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/sync/unreadable-agent-configuration-prevents-reconciliation",
  title: "Unreadable agent configuration prevents reconciliation",
  statement:
    "When an agent skill-directory configuration source cannot be read, AXM shall report the configuration failure before changing workspace or agent files, without treating the agent's outputs as absent or already reconciled.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition", "actionable-diagnostics"],
  methods: ["decision-table", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Agent configuration failure", () => {
  it.effect.each([
    { agent: "claude-code", key: "AXM_CLAUDE_SKILLS_DIR" },
    { agent: "gemini-cli", key: "AXM_GEMINI_CLI_SKILLS_DIR" },
  ])("blocks $agent reconciliation and catalog lookup without changing files", ({ agent, key }) => {
    const workspace = makeSyncFixture({
      settings: { owner: "@acme", agents: [agent] },
      files: { ".claude/skills/keep/SKILL.md": "Keep this user-authored content." },
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          const before = workspace.snapshot();
          const sourceError = new ConfigProvider.SourceError({ message: "source unavailable" });
          const original = yield* ConfigProvider.ConfigProvider;
          const provider = ConfigProvider.make((path) =>
            path[0] === key ? Effect.fail(sourceError) : original.load(path),
          );
          const failure = yield* applySync().pipe(
            Effect.provideService(ConfigProvider.ConfigProvider, provider),
            Effect.flip,
          );
          expect(failure).toMatchObject({ _tag: "ConfigError", cause: sourceError });
          const catalog = yield* WorkspaceCatalog;
          const catalogFailure = yield* catalog.skillCandidates.pipe(
            Effect.provideService(ConfigProvider.ConfigProvider, provider),
            Effect.flip,
          );
          expect(catalogFailure).toMatchObject({ _tag: "ConfigError", cause: sourceError });
          expect(workspace.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
  });
});
