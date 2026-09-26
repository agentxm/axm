/**
 * Tests for the derived agent descriptors.
 *
 * Uses dynamic tests that iterate over the registry automatically,
 * ensuring all agents are validated without hardcoding agent lists.
 */

import { describe, expect, it } from "vitest";
import { AGENT_DESCRIPTORS } from "./registry.js";
import { MATERIALIZATION_TARGET_IDS } from "./types.js";

describe("derived agent descriptors", () => {
  const agents = Object.values(AGENT_DESCRIPTORS);
  const skillAgents = agents.filter(
    (agent): agent is typeof agent & { readonly skills: NonNullable<typeof agent.skills> } =>
      agent.skills !== undefined,
  );

  it("only exposes verified writable Skill surfaces", () => {
    expect(skillAgents).toHaveLength(61);
    expect(agents.length - skillAgents.length).toBe(2);
  });

  it.each(skillAgents)("agent $id has required skills.dir", (config) => {
    expect(config.skills.dir.length).toBeGreaterThan(0);
  });

  it.each(skillAgents)(
    "agent $id dir ends with /skills or /rules (per reference spec)",
    (config) => {
      // Most agents use /skills, but augment uses /rules per vercel-labs/skills spec
      // openclaw uses bare "skills" directory (no leading dot-folder)
      expect(config.skills.dir).toMatch(/(\/skills$|\/rules$|^skills$)/);
    },
  );

  it.each(agents)("agent $id id exists in the descriptor record", (config) => {
    expect(AGENT_DESCRIPTORS[config.id]).toBe(config);
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

  it.each(skillAgents)("agent $id dir is relative (not absolute)", (config) => {
    expect(config.skills.dir.startsWith("/")).toBe(false);
    expect(config.skills.dir.startsWith("~")).toBe(false);
  });

  it.each(skillAgents)("agent $id additional Skill read paths are relative", (config) => {
    for (const { path } of config.skills.additionalReadPaths) {
      expect(path.startsWith("/")).toBe(false);
      expect(path.startsWith("~")).toBe(false);
      expect(path).not.toBe(config.skills.dir);
    }
  });
});

describe("MATERIALIZATION_TARGET_IDS", () => {
  it("contains the descriptor IDs", () => {
    expect(MATERIALIZATION_TARGET_IDS).toContain("claude-code");
    expect(MATERIALIZATION_TARGET_IDS).toContain("cursor");
    expect(MATERIALIZATION_TARGET_IDS).toContain("codex");
    expect(MATERIALIZATION_TARGET_IDS).toContain("universal");
  });

  it("has the same count as the descriptor record", () => {
    expect(MATERIALIZATION_TARGET_IDS.length).toBe(Object.keys(AGENT_DESCRIPTORS).length);
  });
});
