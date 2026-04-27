/**
 * Tests for the AGENTS registry.
 *
 * Uses dynamic tests that iterate over the registry automatically,
 * ensuring all agents are validated without hardcoding agent lists.
 */

import { describe, expect, it } from "vitest";
import { AGENTS, getAgentIds } from "./registry.js";

describe("AGENTS registry", () => {
  const agents = Object.values(AGENTS);

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
