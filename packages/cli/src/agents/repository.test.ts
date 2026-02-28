import * as NodeContext from "@effect/platform-node/NodeContext";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Workspace, type WorkspaceContextService } from "../workspace/service.js";
import { makeBaseWorkspaceMock } from "../workspace/test-stubs.js";
import { DefaultCodingAgentRepository } from "./repository.js";

const withWorkspace = (configuredAgents: ReadonlyArray<string>) => {
  const wsMock: WorkspaceContextService = makeBaseWorkspaceMock("/tmp/axm", {
    getConfiguredAgents: () => Effect.succeed(configuredAgents),
  });

  return Layer.mergeAll(NodeContext.layer, Workspace.layer(wsMock));
};

describe("DefaultCodingAgentRepository", () => {
  it.effect("returns configured known agents", () =>
    Effect.gen(function* () {
      const agents = yield* DefaultCodingAgentRepository.getConfiguredAgents();
      expect(agents.map((agent) => agent.id)).toEqual(["claude-code", "cursor"]);
    }).pipe(Effect.provide(withWorkspace(["claude-code", "cursor"]))),
  );

  it.effect("surfaces unknown configured agent ids", () =>
    Effect.gen(function* () {
      const unknown = yield* DefaultCodingAgentRepository.getUnknownConfiguredAgentIds();
      expect(unknown).toEqual(["unknown-agent"]);
    }).pipe(Effect.provide(withWorkspace(["claude-code", "unknown-agent"]))),
  );
});
