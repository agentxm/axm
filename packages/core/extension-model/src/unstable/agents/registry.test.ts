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

  it("exposes declared native Skill readers separately from writer support", () => {
    expect(skillAgents).toHaveLength(60);
    expect(agents.length - skillAgents.length).toBe(2);
  });

  it.each(skillAgents)("agent $id declares its Skill reader locations", (config) => {
    expect(config.skills.locations.length).toBeGreaterThan(0);
    expect(typeof config.skills.writerSupported).toBe("boolean");
    for (const location of config.skills.locations) {
      expect(location.path.length).toBeGreaterThan(0);
      expect(location.shape).toBe("directory");
      expect(config.skills.scopes).toContain(location.scope);
    }
  });

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

  it.each(skillAgents)("agent $id locations are relative to an explicit root", (config) => {
    for (const location of config.skills.locations) {
      expect(location.path.startsWith("/")).toBe(false);
      expect(location.path.startsWith("~")).toBe(false);
      if (location.scope === "project") expect(location.root).toBe("project");
      else expect(["home", "xdg-config"]).toContain(location.root);
    }
  });

  it.each(skillAgents)("agent $id has no duplicate reader declaration", (config) => {
    const keys = config.skills.locations.map((location) =>
      JSON.stringify([location.scope, location.root, location.path]),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("MATERIALIZATION_TARGET_IDS", () => {
  it("contains the descriptor IDs", () => {
    expect(MATERIALIZATION_TARGET_IDS).toContain("claude-code");
    expect(MATERIALIZATION_TARGET_IDS).toContain("cursor");
    expect(MATERIALIZATION_TARGET_IDS).toContain("codex");
    expect(MATERIALIZATION_TARGET_IDS).not.toContain("universal");
  });

  it("has the same count as the descriptor record", () => {
    expect(MATERIALIZATION_TARGET_IDS.length).toBe(Object.keys(AGENT_DESCRIPTORS).length);
  });
});
