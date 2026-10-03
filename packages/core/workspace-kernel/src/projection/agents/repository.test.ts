import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { NativeWriteAuthorityPermissive } from "../../agent-adapters/testing.js";
import { SettingsReader } from "../../workspace-state/index.js";
import { makeCodingAgentRepositoryService } from "./repository.js";

const withWorkspace = (configuredAgents: ReadonlyArray<string>) =>
  Layer.mergeAll(
    Layer.mock(SettingsReader, { configuredAgents: Effect.succeed(configuredAgents) }),
    NodeServices.layer,
    NativeWriteAuthorityPermissive,
  );

const DefaultCodingAgentRepository = makeCodingAgentRepositoryService({
  skillsDirectoryOverrides: {},
});

describe("coding agent repository", () => {
  it.effect("returns configured known agents", () =>
    Effect.gen(function* () {
      const agents = yield* DefaultCodingAgentRepository.getConfiguredAgents();
      expect(agents.map((agent) => agent.id)).toEqual(["claude-code", "cursor"]);
    }).pipe(Effect.provide(withWorkspace(["claude-code", "cursor"]))),
  );

  it.effect("uses descriptor subagent directories for fallback agents", () =>
    Effect.gen(function* () {
      const [agent] = yield* DefaultCodingAgentRepository.getConfiguredAgents();
      expect(agent?.id).toBe("qoder");
      if (!agent) {
        throw new Error("Expected configured agent");
      }

      const subagents = yield* agent.resolveEffectiveSubagentsDir({
        workspaceRoot: "/workspace",
        scope: "project",
      });
      expect(subagents).toEqual({
        _tag: "supported",
        dir: "/workspace/.qoder/agents",
        warnings: [],
      });
    }).pipe(Effect.provide(withWorkspace(["qoder"]))),
  );

  it.effect("resolves skills only for agents the capability catalog supports", () =>
    Effect.gen(function* () {
      const agents = yield* DefaultCodingAgentRepository.all;
      const resolved = yield* Effect.forEach(agents, (agent) =>
        agent
          .resolveEffectiveSkillsDir({ workspaceRoot: "/workspace", scope: "project" })
          .pipe(Effect.map((outcome) => [agent.id, outcome._tag] as const)),
      );

      expect(resolved.filter(([, tag]) => tag !== "supported")).toEqual([
        ["codemaker", "unsupported"],
        ["hermes", "unsupported"],
        ["minimax-code", "unsupported"],
        ["openclaw", "unverified"],
        ["vscode", "unsupported"],
        ["roo", "unsupported"],
      ]);
    }).pipe(Effect.provide(withWorkspace([]))),
  );

  it.effect("keeps deprecated Skill read paths out of the write target", () =>
    Effect.gen(function* () {
      const [agent] = yield* DefaultCodingAgentRepository.getConfiguredAgents();
      expect(agent?.id).toBe("zencoder");
      if (!agent) {
        throw new Error("Expected configured agent");
      }

      const resolved = yield* agent.resolveEffectiveSkillsDir({
        workspaceRoot: "/workspace",
        scope: "project",
      });
      expect(resolved).toEqual({
        _tag: "supported",
        dir: "/workspace/.agents/skills",
      });
    }).pipe(Effect.provide(withWorkspace(["zencoder"]))),
  );

  it.effect("keeps shared placement separate from materialization agents", () =>
    Effect.gen(function* () {
      const agents = yield* DefaultCodingAgentRepository.getMaterializationAgents();
      expect(agents.map((agent) => agent.id)).toEqual(["claude-code", "cursor"]);
    }).pipe(Effect.provide(withWorkspace(["claude-code", "cursor"]))),
  );

  it.effect("has no synthetic materialization agent with empty membership", () =>
    Effect.gen(function* () {
      const configured = yield* DefaultCodingAgentRepository.getConfiguredAgents();
      const materialization = yield* DefaultCodingAgentRepository.getMaterializationAgents();
      const unknown = yield* DefaultCodingAgentRepository.getUnknownConfiguredAgentIds();

      expect(configured.map((agent) => agent.id)).toEqual([]);
      expect(materialization.map((agent) => agent.id)).toEqual([]);
      expect(unknown).toEqual([]);
    }).pipe(Effect.provide(withWorkspace([]))),
  );

  it.effect("surfaces unknown configured agent ids", () =>
    Effect.gen(function* () {
      const unknown = yield* DefaultCodingAgentRepository.getUnknownConfiguredAgentIds();
      expect(unknown).toEqual(["unknown-agent"]);
    }).pipe(Effect.provide(withWorkspace(["claude-code", "unknown-agent"]))),
  );
});
