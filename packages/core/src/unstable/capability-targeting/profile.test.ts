import { describe, expect, it } from "@effect/vitest";

import { capabilityRenderTargetForAgentId } from "./profile.js";

describe("capabilityRenderTargetForAgentId", () => {
  it("derives portable extension capability grades from the catalog", () => {
    const target = capabilityRenderTargetForAgentId("codex");

    expect(target.capabilities["skills"]).toEqual(["full", "native"]);
    expect(target.capabilities["subagents"]).toEqual(["native", "permissioned"]);
    expect(target.capabilities["rules"]).toEqual(["full", "native"]);
    expect(target.capabilities["files"]).toBeUndefined();
    expect(target.tokens["dir:skills"]).toBe(".agents/skills");
  });

  it("loads target-specific nouns and affordance phrases from catalog columns", () => {
    const claude = capabilityRenderTargetForAgentId("claude-code");

    expect(claude.capabilities["structured-input"]).toEqual(["native"]);
    expect(claude.tokens["tool:structured-input"]).toBe("AskUserQuestion");
    expect(claude.tokens["do:ask-structured"]).toContain("AskUserQuestion");
  });

  it("returns the empty baseline profile for the universal target", () => {
    expect(capabilityRenderTargetForAgentId("universal")).toEqual({
      agentId: "universal",
      inheritedAgentIds: [],
      capabilities: {},
      tokens: {},
    });
  });
});
