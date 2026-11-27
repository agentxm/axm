/**
 * Catalog-derived agent projector and scoped agent read-model tests.
 *
 * Covers declared (settings-driven), actual (scanner-driven), and detected
 * (composition) per the spec scenarios for `agents.declared(id)`,
 * `agents.actual(id)`, and `agents.detected`. Every configurable catalog agent
 * shares the same projectors, so the common cases run over the whole catalog.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { AGENT_DESCRIPTORS } from "@agentxm/extension-model/unstable/agents/registry";
import { CONFIGURABLE_AGENT_IDS } from "@agentxm/extension-model/unstable/agent-capabilities/identity";
import { absentAll } from "../__fixtures__/builder.js";
import {
  makeAgentDirOccurrence,
  makeAgentMcpConfigOccurrence,
  makeAgentSettingsOccurrence,
} from "../__fixtures__/occurrences.js";
import { WorkspaceReadModelTest } from "../__fixtures__/test-layer.js";
import {
  actualAgent,
  declaredAgent,
  detectedAgent,
  makeScopedAgentsApi,
  type AgentScannerObservations,
} from "../agents.js";
import { makeWorkspaceReadModel } from "../service.js";

const noObservations: AgentScannerObservations = {
  agentDir: [],
  agentSettings: [],
  mcpConfig: [],
};

describe.each(CONFIGURABLE_AGENT_IDS)("%s projectors", (agentId) => {
  const dirObservation = makeAgentDirOccurrence({
    scope: "project",
    type: "skill",
    agentId,
    name: "some-skill",
    contentLocation: `/repo/.${agentId}/skills/some-skill`,
  });

  it("declared returns Some when settings declare the agent", () => {
    const result = declaredAgent(agentId, "project", Option.some({ agents: [agentId] }));
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value.agentId).toBe(agentId);
      expect(result.value.scope).toBe("project");
    }
  });

  it("declared returns None when settings are absent", () => {
    expect(Option.isNone(declaredAgent(agentId, "project", Option.none()))).toBe(true);
  });

  it("actual returns Some when the scanner observed the agent", () => {
    const result = actualAgent(agentId, "project", {
      ...noObservations,
      agentDir: [dirObservation],
    });
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value.agentDirOccurrences).toHaveLength(1);
    }
  });

  it("detected returns managed-and-present when declared and present", () => {
    const declared = declaredAgent(agentId, "project", Option.some({ agents: [agentId] }));
    const actual = actualAgent(agentId, "project", {
      ...noObservations,
      agentDir: [dirObservation],
    });
    const result = detectedAgent(agentId, "project", declared, true, actual);
    expect(Option.isSome(result) ? result.value.status : undefined).toBe("managed-and-present");
  });
});

describe("claude-code projectors", () => {
  const agentId = "claude-code";

  const skillObservation = makeAgentDirOccurrence({
    scope: "project",
    type: "skill",
    agentId,
    name: "some-skill",
    contentLocation: "/repo/.claude/skills/some-skill",
  });

  const settingsObservation = makeAgentSettingsOccurrence({
    scope: "project",
    agentId,
    contentLocation: "/repo/.claude/settings.json",
  });

  const mcpObservation = makeAgentMcpConfigOccurrence({
    scope: "project",
    agentId,
    name: "some-server",
    contentLocation: "/repo/.claude/mcp.json",
  });

  it("declared returns None when settings exist but do not include claude-code", () => {
    const result = declaredAgent(agentId, "project", Option.some({ agents: ["cursor"] }));
    expect(Option.isNone(result)).toBe(true);
  });

  it("actual returns Some when only agent-settings observation exists", () => {
    const result = actualAgent(agentId, "project", {
      ...noObservations,
      agentSettings: [settingsObservation],
    });
    expect(Option.isSome(result)).toBe(true);
  });

  it("actual returns Some when only an agent MCP config observation exists", () => {
    const result = actualAgent(agentId, "project", {
      ...noObservations,
      mcpConfig: [mcpObservation],
    });
    expect(Option.isSome(result)).toBe(true);
  });

  it("actual returns None when no observations reference claude-code", () => {
    expect(Option.isNone(actualAgent(agentId, "project", noObservations))).toBe(true);
  });

  it("actual ignores observations from other agents", () => {
    const cursorObservation = makeAgentDirOccurrence({
      scope: "project",
      type: "skill",
      agentId: "cursor",
      name: "some-skill",
      contentLocation: "/repo/.claude/skills/some-skill",
    });
    const result = actualAgent(agentId, "project", {
      ...noObservations,
      agentDir: [cursorObservation],
    });
    expect(Option.isNone(result)).toBe(true);
  });

  it("detected returns managed-not-present when declared but no actual", () => {
    const declared = declaredAgent(agentId, "project", Option.some({ agents: [agentId] }));
    const actual = actualAgent(agentId, "project", noObservations);
    const result = detectedAgent(agentId, "project", declared, false, actual);
    expect(Option.isSome(result) ? result.value.status : undefined).toBe("managed-not-present");
  });

  it("detected returns unmanaged-present when actual but not declared", () => {
    const declared = declaredAgent(agentId, "project", Option.none());
    const actual = actualAgent(agentId, "project", {
      ...noObservations,
      agentDir: [skillObservation],
    });
    const result = detectedAgent(agentId, "project", declared, true, actual);
    expect(Option.isSome(result) ? result.value.status : undefined).toBe("unmanaged-present");
  });

  it("detected returns None when neither declared nor actual", () => {
    const result = detectedAgent(agentId, "project", Option.none(), false, Option.none());
    expect(Option.isNone(result)).toBe(true);
  });
});

describe("roo projectors", () => {
  // Roo's subagent surface is single-file (`.roomodes`); exercise it with an
  // `agent-dir` occurrence whose `contentLocation` is the file path.
  const rooModesObservation = makeAgentDirOccurrence({
    scope: "project",
    type: "subagent",
    agentId: "roo",
    name: ".roomodes",
    contentLocation: "/repo/.roomodes",
    singleFile: true,
  });

  it("actual returns Some when .roomodes file observation present", () => {
    const result = actualAgent("roo", "project", {
      ...noObservations,
      agentDir: [rooModesObservation],
    });
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value.agentDirOccurrences).toHaveLength(1);
    }
  });

  it("declared+actual yields managed-and-present", () => {
    const declared = declaredAgent("roo", "project", Option.some({ agents: ["roo"] }));
    const actual = actualAgent("roo", "project", {
      ...noObservations,
      agentDir: [rooModesObservation],
    });
    const result = detectedAgent("roo", "project", declared, true, actual);
    expect(Option.isSome(result) ? result.value.status : undefined).toBe("managed-and-present");
  });
});

describe("scoped agents API", () => {
  it.effect("detected lists every declared configurable agent in canonical order", () =>
    Effect.gen(function* () {
      const agents = makeScopedAgentsApi({
        scope: "project",
        settings: Effect.succeed(Option.some({ agents: [...CONFIGURABLE_AGENT_IDS].reverse() })),
        presence: Effect.succeed(new Set()),
        observations: Effect.succeed(noObservations),
      });
      const detected = yield* agents.detected;
      expect(detected.map((agent) => agent.agentId)).toEqual([...CONFIGURABLE_AGENT_IDS]);
    }),
  );

  it.effect("scope.agents.known returns registry descriptors in registry order", () =>
    Effect.gen(function* () {
      const layer = WorkspaceReadModelTest(absentAll("/workspace", "/home"));
      yield* Effect.gen(function* () {
        const readModel = yield* makeWorkspaceReadModel("project");
        const known = yield* readModel.agents.known;
        expect(known.map((agent) => agent.id)).toEqual(
          Object.values(AGENT_DESCRIPTORS).map((agent) => agent.id),
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
