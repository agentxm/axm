import { describe, expect, it } from "vitest";

import { AGENT_DESCRIPTORS } from "@agentxm/extension-model/unstable/agents/registry";

import { undetectedAgentOffer } from "./initialization.js";

describe("undetectedAgentOffer", () => {
  it("suggests the popular agents when the workstation has none either", () => {
    const offer = undetectedAgentOffer([]);

    expect(offer.userDetectedIds).toEqual([]);
    expect(offer.suggestedIds).toContain("claude-code");
    expect(offer.allAgents.slice(0, offer.suggestedIds.length).map((agent) => agent.id)).toEqual(
      offer.suggestedIds,
    );
  });

  it("suggests the workstation's agents first, and only those", () => {
    const offer = undetectedAgentOffer([
      { agent: AGENT_DESCRIPTORS.codex, project: false, user: true },
    ]);

    expect(offer.suggestedIds).toEqual(["codex"]);
    expect(offer.userDetectedIds).toEqual(["codex"]);
    expect(offer.allAgents[0]?.id).toBe("codex");
  });

  it("offers every agent once and claims nothing about the project", () => {
    const offer = undetectedAgentOffer([
      { agent: AGENT_DESCRIPTORS.codex, project: false, user: true },
    ]);
    const ids = offer.allAgents.map((agent) => agent.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(offer.projectDetectedIds).toEqual([]);
    expect(offer.configuredIds).toEqual([]);
  });
});
