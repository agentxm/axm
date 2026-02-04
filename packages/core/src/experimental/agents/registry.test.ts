/**
 * Tests for the AGENTS registry and lookup functions.
 *
 * Uses dynamic tests that iterate over the registry automatically,
 * ensuring all agents are validated without hardcoding agent lists.
 */

import * as Option from "effect/Option"
import { describe, expect, it } from "vitest";
import { AGENTS, getAgentById, getAgentIds, getAllAgents } from "./registry.js";

describe("AGENTS registry", () => {
  // Get all agents for iteration in tests
  const agents = getAllAgents();

  it.each(agents)("agent $id has required skills.projectDir", (config) => {
    expect(config.skills.projectDir).toBeDefined();
    expect(config.skills.projectDir.length).toBeGreaterThan(0);
  });

  it.each(agents)(
    "agent $id projectDir ends with /skills or /rules (per reference spec)",
    (config) => {
      // Most agents use /skills, but augment uses /rules per vercel-labs/skills spec
      // openclaw uses bare "skills" directory (no leading dot-folder)
      expect(config.skills.projectDir).toMatch(/(\/skills$|\/rules$|^skills$)/);
    },
  );

  it.each(agents)("agent $id globalDir is Option (not undefined)", (config) => {
    expect(Option.isOption(config.skills.globalDir)).toBe(true);
  });

  it.each(agents)("agent $id id exists in AGENTS registry", (config) => {
    expect(AGENTS[config.id]).toBe(config);
  });

  it("contains at least 30 agents", () => {
    expect(agents.length).toBeGreaterThanOrEqual(30);
  });

  it("has unique agent IDs", () => {
    const ids = agents.map((a) => a.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("has unique agent names", () => {
    const names = agents.map((a) => a.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it.each(agents)("agent $id projectDir is relative (not absolute)", (config) => {
    expect(config.skills.projectDir.startsWith("/")).toBe(false);
    expect(config.skills.projectDir.startsWith("~")).toBe(false);
  });

  it.each(agents)("agent $id globalDir when Some is absolute path", (config) => {
    if (Option.isSome(config.skills.globalDir)) {
      const globalDir = config.skills.globalDir.value;
      expect(globalDir.startsWith("/")).toBe(true);
    }
  });
});

describe("getAgentById", () => {
  const agents = getAllAgents();

  it("returns Option.some for all known agents", () => {
    for (const agent of agents) {
      const result = getAgentById(agent.id);
      expect(Option.isSome(result)).toBe(true);
    }
  });

  it("returns correct config for known agent", () => {
    const result = getAgentById("claude-code");
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value.name).toBe("Claude Code");
      expect(result.value.skills.projectDir).toBe(".claude/skills");
    }
  });

  it("returns Option.none for unknown agent", () => {
    const result = getAgentById("unknown-agent-xyz");
    expect(Option.isNone(result)).toBe(true);
  });

  it("returns Option.none for empty string", () => {
    const result = getAgentById("");
    expect(Option.isNone(result)).toBe(true);
  });
});

describe("getAgentIds", () => {
  it("returns array of agent IDs", () => {
    const ids = getAgentIds();
    expect(Array.isArray(ids)).toBe(true);
    expect(ids).toContain("claude-code");
    expect(ids).toContain("cursor");
    expect(ids).toContain("codex");
  });

  it("returns same count as AGENTS registry", () => {
    const ids = getAgentIds();
    const entryCount = Object.keys(AGENTS).length;
    expect(ids.length).toBe(entryCount);
  });
});

describe("getAllAgents", () => {
  it("returns all agents from registry", () => {
    const all = getAllAgents();
    const entryCount = Object.keys(AGENTS).length;
    expect(all.length).toBe(entryCount);
  });

  it("returns array of AgentConfig objects", () => {
    const all = getAllAgents();
    for (const agent of all) {
      expect(agent.id).toBeTruthy();
      expect(agent.name).toBeTruthy();
      expect(agent.skills).toBeDefined();
      expect(agent.skills.projectDir).toBeTruthy();
      expect(Option.isOption(agent.skills.globalDir)).toBe(true);
    }
  });

  it("includes claude-code agent", () => {
    const all = getAllAgents();
    const claudeCode = all.find((a) => a.id === "claude-code");
    expect(claudeCode).toBeDefined();
    expect(claudeCode?.name).toBe("Claude Code");
  });
});
