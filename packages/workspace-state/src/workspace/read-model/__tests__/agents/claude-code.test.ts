/**
 * claude-code per-agent module: golden-path projector tests.
 *
 * Covers declared (settings-driven), actual (scanner-driven), and detected
 * (composition) per the spec scenarios for `agents.declared(id)`,
 * `agents.actual(id)`, and `agents.detected`.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import {
  makeAgentDirOccurrence,
  makeAgentMcpConfigOccurrence,
  makeAgentSettingsOccurrence,
} from "../../__fixtures__/occurrences.js";
import { getAgentModule } from "../../agents/index.js";
import type { AgentScannerObservations } from "../../agents/types.js";

const module = getAgentModule("claude-code");

const noObservations: AgentScannerObservations = {
  agentDir: [],
  agentSettings: [],
  mcpConfig: [],
};

const skillObservation = makeAgentDirOccurrence({
  scope: "project",
  type: "skill",
  agentId: "claude-code",
  name: "some-skill",
  contentLocation: "/repo/.claude/skills/some-skill",
});

const settingsObservation = makeAgentSettingsOccurrence({
  scope: "project",
  agentId: "claude-code",
  contentLocation: "/repo/.claude/settings.json",
});

const mcpObservation = makeAgentMcpConfigOccurrence({
  scope: "project",
  agentId: "claude-code",
  name: "some-server",
  contentLocation: "/repo/.claude/mcp.json",
});

describe("agents/claude-code module", () => {
  it("identifies as claude-code with skill/subagent subjects", () => {
    expect(module.agentId).toBe("claude-code");
    expect(module.subjects).toEqual(["skill", "subagent"]);
  });

  it("declared returns Some when settings include claude-code in agents", () => {
    const result = module.declared("project", Option.some({ agents: ["claude-code"] }));
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value.agentId).toBe("claude-code");
      expect(result.value.scope).toBe("project");
    }
  });

  it("declared returns None when settings absent", () => {
    const result = module.declared("project", Option.none());
    expect(Option.isNone(result)).toBe(true);
  });

  it("declared returns None when settings exist but do not include claude-code", () => {
    const result = module.declared("project", Option.some({ agents: ["cursor"] }));
    expect(Option.isNone(result)).toBe(true);
  });

  it("actual returns Some when an agent-dir observation exists", () => {
    const result = module.actual("project", {
      ...noObservations,
      agentDir: [skillObservation],
    });
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value.agentDirOccurrences).toHaveLength(1);
    }
  });

  it("actual returns Some when only agent-settings observation exists", () => {
    const result = module.actual("project", {
      ...noObservations,
      agentSettings: [settingsObservation],
    });
    expect(Option.isSome(result)).toBe(true);
  });

  it("actual returns Some when only an agent MCP config observation exists", () => {
    const result = module.actual("project", {
      ...noObservations,
      mcpConfig: [mcpObservation],
    });
    expect(Option.isSome(result)).toBe(true);
  });

  it("actual returns None when no observations reference claude-code", () => {
    const result = module.actual("project", noObservations);
    expect(Option.isNone(result)).toBe(true);
  });

  it("actual ignores observations from other agents", () => {
    const cursorObservation = makeAgentDirOccurrence({
      scope: "project",
      type: "skill",
      agentId: "cursor",
      name: "some-skill",
      contentLocation: "/repo/.claude/skills/some-skill",
    });
    const result = module.actual("project", {
      ...noObservations,
      agentDir: [cursorObservation],
    });
    expect(Option.isNone(result)).toBe(true);
  });

  it("detected returns managed-and-present when declared and actual present", () => {
    const declaredOpt = module.declared("project", Option.some({ agents: ["claude-code"] }));
    const actualOpt = module.actual("project", {
      ...noObservations,
      agentDir: [skillObservation],
    });
    const result = module.detected("project", declaredOpt, true, actualOpt);
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value.status).toBe("managed-and-present");
    }
  });

  it("detected returns managed-not-present when declared but no actual", () => {
    const declaredOpt = module.declared("project", Option.some({ agents: ["claude-code"] }));
    const actualOpt = module.actual("project", noObservations);
    const result = module.detected("project", declaredOpt, false, actualOpt);
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value.status).toBe("managed-not-present");
    }
  });

  it("detected returns unmanaged-present when actual but not declared", () => {
    const declaredOpt = module.declared("project", Option.none());
    const actualOpt = module.actual("project", {
      ...noObservations,
      agentDir: [skillObservation],
    });
    const result = module.detected("project", declaredOpt, true, actualOpt);
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value.status).toBe("unmanaged-present");
    }
  });

  it("detected returns None when neither declared nor actual", () => {
    const result = module.detected("project", Option.none(), false, Option.none());
    expect(Option.isNone(result)).toBe(true);
  });
});
