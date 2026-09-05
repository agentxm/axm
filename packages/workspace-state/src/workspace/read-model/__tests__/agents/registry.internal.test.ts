/**
 * Catalog-derived agent registry tests. Every configurable catalog agent gets
 * the common declared, actual, and detected projectors without a per-agent
 * placeholder module.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { AGENTS } from "@agentxm/extension-model/unstable/agents/registry";
import { AGENT_IDS, type AgentId } from "@agentxm/extension-model/unstable/agents/types";
import { absentAll } from "../../__fixtures__/builder.js";
import { WorkspaceReadModelTest } from "../../__fixtures__/test-layer.js";
import { makeWorkspaceReadModel } from "../../service.js";
import { getAgentModule, registeredAgentModules, type AgentModule } from "../../agents/index.js";

const readModelAgentIds = AGENT_IDS.filter((id) => id !== "universal");

describe("agents/index.ts barrel", () => {
  it("lists every registered agent id exactly once in canonical order", () => {
    expect(registeredAgentModules.length).toBe(readModelAgentIds.length);
    const seen = new Set<AgentId>();
    registeredAgentModules.forEach((module, i) => {
      expect(module.agentId).toBe(readModelAgentIds[i]);
      expect(seen.has(module.agentId)).toBe(false);
      seen.add(module.agentId);
    });
    for (const id of readModelAgentIds) {
      expect(seen.has(id)).toBe(true);
    }
  });

  it("each module's agentId is valid", () => {
    const validIds: ReadonlySet<string> = new Set<string>(AGENT_IDS);
    for (const module of registeredAgentModules) {
      expect(validIds.has(module.agentId)).toBe(true);
    }
  });

  it("each module exposes the required projector functions and subjects", () => {
    for (const module of registeredAgentModules) {
      const m: AgentModule = module;
      expect(typeof m.declared).toBe("function");
      expect(typeof m.actual).toBe("function");
      expect(typeof m.detected).toBe("function");
      expect(Array.isArray(m.subjects)).toBe(true);
    }
  });

  it("getAgentModule returns the matching module for every AGENT_IDS entry", () => {
    for (const id of readModelAgentIds) {
      const m = getAgentModule(id);
      expect(m.agentId).toBe(id);
    }
  });

  it.effect("scope.agents.known returns registry descriptors in registry order", () =>
    Effect.gen(function* () {
      const layer = WorkspaceReadModelTest(absentAll("/workspace", "/home"));
      yield* Effect.gen(function* () {
        const readModel = yield* makeWorkspaceReadModel("project");
        const known = yield* readModel.agents.known;
        expect(known.map((agent) => agent.id)).toEqual(
          Object.values(AGENTS).map((agent) => agent.id),
        );
      }).pipe(Effect.provide(layer));
    }),
  );

  it.effect("scope.agents.byId returns descriptors for known ids", () =>
    Effect.gen(function* () {
      const layer = WorkspaceReadModelTest(absentAll("/workspace", "/home"));
      yield* Effect.gen(function* () {
        const readModel = yield* makeWorkspaceReadModel("project");
        const known = readModel.agents.byId("codex");
        const unknown = readModel.agents.byId("unknown-agent");
        expect(Option.isSome(known)).toBe(true);
        expect(Option.isSome(known) ? known.value.id : undefined).toBe("codex");
        expect(Option.isNone(unknown)).toBe(true);
      }).pipe(Effect.provide(layer));
    }),
  );
});
