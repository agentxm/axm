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
      expect(agent?.id).toBe("amp");
      if (!agent) {
        throw new Error("Expected configured agent");
      }

      const addOutcome = yield* agent.addMcpServer({
        workspaceRoot: "/workspace",
        serverName: "chrome-devtools-mcp",
        canonicalPath: "/workspace/.axm/mcps/chrome-devtools-mcp",
        owner: handle("@mcp"),
        resolvedVersion: "1.0.0",
      });
      expect(addOutcome).toEqual({
        _tag: "unsupported",
        reason: "MCP add is not supported for amp",
      });

      const removeOutcome = yield* agent.removeMcpServer({
        workspaceRoot: "/workspace",
        serverName: "chrome-devtools-mcp",
      });
      expect(removeOutcome).toEqual({
        _tag: "unsupported",
        reason: "MCP remove is not supported for amp",
      });
    }).pipe(Effect.provide(withWorkspace(["amp"]))),
  );

  it.effect("returns configured known agents", () =>
    Effect.gen(function* () {
      const agents = yield* DefaultCodingAgentRepository.getConfiguredAgents();
      expect(agents.map((agent) => agent.id)).toEqual(["claude-code", "cursor"]);
      expect(agents[0]).toBe(claudeCodeCodingAgent);
      expect(agents[1]).toBe(cursorCodingAgent);
    }).pipe(Effect.provide(withWorkspace(["claude-code", "cursor"]))),
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
