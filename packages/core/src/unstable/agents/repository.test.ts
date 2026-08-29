import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  WorkspaceMutations,
  type WorkspaceMutationsService,
} from "../workspace/service-interface.js";
import { makeBaseWorkspaceMock } from "../workspace/test-stubs.js";
import { handle } from "../test-helpers.js";
import { claudeCodeCodingAgent } from "./claude-code/service.js";
import { cursorCodingAgent } from "./cursor/service.js";
import { DefaultCodingAgentRepository } from "./repository.js";

const withWorkspace = (configuredAgents: ReadonlyArray<string>) => {
  const wsMock: WorkspaceMutationsService = makeBaseWorkspaceMock("/tmp/axm", {
    getConfiguredAgents: () => Effect.succeed(configuredAgents),
  });

  return Layer.mergeAll(NodeServices.layer, WorkspaceMutations.layer(wsMock));
};

describe("DefaultCodingAgentRepository", () => {
  it.effect("returns fallback MCP contract for configured agents without custom adapter", () =>
    Effect.gen(function* () {
      const [agent] = yield* DefaultCodingAgentRepository.getConfiguredAgents();
      expect(agent?.id).toBe("adal");
      if (!agent) {
        throw new Error("Expected configured agent");
      }

      const addOutcome = yield* agent.addMcpServer({
        workspaceRoot: "/workspace",
        serverName: "chrome-devtools-mcp",
        canonicalPath: "/workspace/agent_extensions/agentxm/@mcp/mcps/chrome-devtools-mcp",
        owner: handle("@mcp"),
        resolvedVersion: "1.0.0",
      });
      expect(addOutcome).toEqual({
        _tag: "unsupported",
        reason: "adal does not have MCP config support",
      });

      const removeOutcome = yield* agent.removeMcpServer({
        workspaceRoot: "/workspace",
        serverName: "chrome-devtools-mcp",
      });
      expect(removeOutcome).toEqual({
        _tag: "unsupported",
        reason: "adal does not have MCP config support",
      });
    }).pipe(Effect.provide(withWorkspace(["adal"]))),
  );

  it.effect("returns configured known agents", () =>
    Effect.gen(function* () {
      const agents = yield* DefaultCodingAgentRepository.getConfiguredAgents();
      expect(agents.map((agent) => agent.id)).toEqual(["claude-code", "cursor"]);
      expect(agents[0]).toBe(claudeCodeCodingAgent);
      expect(agents[1]).toBe(cursorCodingAgent);
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
          .resolveEffectiveSkillsDir({ workspaceRoot: "/workspace" })
          .pipe(Effect.map((outcome) => [agent.id, outcome._tag] as const)),
      );

      expect(resolved.filter(([, tag]) => tag !== "supported")).toEqual([
        ["codemaker", "unsupported"],
        ["minimax-code", "unsupported"],
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

      const resolved = yield* agent.resolveEffectiveSkillsDir({ workspaceRoot: "/workspace" });
      expect(resolved).toEqual({
        _tag: "supported",
        dir: "/workspace/.agents/skills",
      });
    }).pipe(Effect.provide(withWorkspace(["zencoder"]))),
  );

  it.effect("prepends universal to materialization agents", () =>
    Effect.gen(function* () {
      const agents = yield* DefaultCodingAgentRepository.getMaterializationAgents();
      expect(agents.map((agent) => agent.id)).toEqual(["universal", "claude-code", "cursor"]);
    }).pipe(Effect.provide(withWorkspace(["claude-code", "cursor"]))),
  );

  it.effect("does not expose universal as a configured agent", () =>
    Effect.gen(function* () {
      const configured = yield* DefaultCodingAgentRepository.getConfiguredAgents();
      const materialization = yield* DefaultCodingAgentRepository.getMaterializationAgents();
      const unknown = yield* DefaultCodingAgentRepository.getUnknownConfiguredAgentIds();

      expect(configured.map((agent) => agent.id)).toEqual([]);
      expect(materialization.map((agent) => agent.id)).toEqual(["universal"]);
      expect(unknown).toEqual([]);
    }).pipe(Effect.provide(withWorkspace(["universal"]))),
  );

  it.effect("surfaces unknown configured agent ids", () =>
    Effect.gen(function* () {
      const unknown = yield* DefaultCodingAgentRepository.getUnknownConfiguredAgentIds();
      expect(unknown).toEqual(["unknown-agent"]);
    }).pipe(Effect.provide(withWorkspace(["claude-code", "unknown-agent"]))),
  );
});
