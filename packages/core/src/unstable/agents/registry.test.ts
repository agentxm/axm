/**
 * Tests for the AGENTS registry and lookup functions.
 *
 * Uses dynamic tests that iterate over the registry automatically,
 * ensuring all agents are validated without hardcoding agent lists.
 */

import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import { AGENTS, getAgentById, getAgentIds, getAllAgents } from "./registry.js";

describe("AGENTS registry", () => {
  // Get all agents for iteration in tests
  const agents = getAllAgents();

  it.each(agents)("agent $id has required skills.dir", (config) => {
    expect(config.skills.dir).toBeDefined();
    expect(config.skills.dir.length).toBeGreaterThan(0);
  });

  it.each(agents)("agent $id dir ends with /skills or /rules (per reference spec)", (config) => {
    // Most agents use /skills, but augment uses /rules per vercel-labs/skills spec
    // openclaw uses bare "skills" directory (no leading dot-folder)
    expect(config.skills.dir).toMatch(/(\/skills$|\/rules$|^skills$)/);
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

  it.each(agents)("agent $id dir is relative (not absolute)", (config) => {
    expect(config.skills.dir.startsWith("/")).toBe(false);
    expect(config.skills.dir.startsWith("~")).toBe(false);
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

  it("returns correct descriptor for known agent", () => {
    const result = getAgentById("claude-code");
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value.name).toBe("Claude Code");
      expect(result.value.skills.dir).toBe(".claude/skills");
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

  it("returns array of AgentDescriptor objects", () => {
    const all = getAllAgents();
    for (const agent of all) {
      expect(agent.id).toBeTruthy();
      expect(agent.name).toBeTruthy();
      expect(agent.skills).toBeDefined();
      expect(agent.skills.dir).toBeTruthy();
    }
  });

  it("includes claude-code agent", () => {
    const all = getAllAgents();
    const claudeCode = all.find((a) => a.id === "claude-code");
    expect(claudeCode).toBeDefined();
    expect(claudeCode?.name).toBe("Claude Code");
  });
});
