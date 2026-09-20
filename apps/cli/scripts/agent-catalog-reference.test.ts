import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { AGENTS } from "@agentxm/extension-model/unstable/agent-capabilities/catalog";
import { getSupportedExtensionTypesForAgent } from "@agentxm/extension-model/unstable/agent-capabilities/derive";
import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import {
  AgentCatalogReferenceSchema,
  makeAgentCatalogReference,
} from "./agent-catalog-reference.js";

const generatedPath = resolve(
  import.meta.dirname,
  "../site-content/__generated__/agent-catalog/agent-catalog.json",
);

const expectedSupport = (agent: (typeof AGENTS)[number]) => {
  const supportedTypes = new Set(getSupportedExtensionTypesForAgent(agent));
  return {
    skill: supportedTypes.has("skill"),
    "mcp-server": supportedTypes.has("mcp-server"),
    subagent: supportedTypes.has("subagent"),
    rule: supportedTypes.has("rule"),
    hook: supportedTypes.has("hook"),
  };
};

describe("agent catalog reference", () => {
  it("contains one exact public projection for every catalog agent", () => {
    const generated = Schema.decodeUnknownSync(AgentCatalogReferenceSchema, {
      onExcessProperty: "error",
    })(JSON.parse(readFileSync(generatedPath, "utf8")));

    expect(generated).toEqual(makeAgentCatalogReference(AGENTS));
    expect(generated).toHaveLength(AGENTS.length);
    expect(new Set(generated.map((agent) => agent.id)).size).toBe(AGENTS.length);
    for (const entry of generated) {
      const agent = AGENTS.find((candidate) => candidate.id === entry.id);
      expect(agent, entry.id).toBeDefined();
      if (agent !== undefined) expect(entry.support).toEqual(expectedSupport(agent));
    }
  });

  it("is deterministic and excludes operational catalog data", () => {
    const first = makeAgentCatalogReference(AGENTS);
    const second = makeAgentCatalogReference(AGENTS);
    expect(second).toEqual(first);
    expect(JSON.stringify(first)).not.toMatch(
      /"(?:capabilities|detection|docs|interfaces|permissions|rootDir|targeting)":/u,
    );
  });
});
