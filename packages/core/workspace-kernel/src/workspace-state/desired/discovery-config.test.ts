import { describe, expect, it } from "vitest";
import { resolveKnowledgeDiscoveryConfig } from "./discovery-config.js";

describe("resolveKnowledgeDiscoveryConfig", () => {
  it("enables instruction discovery by default", () => {
    expect(resolveKnowledgeDiscoveryConfig({})).toEqual({ instructions: true });
  });

  it("honors the explicit disabled value", () => {
    expect(resolveKnowledgeDiscoveryConfig({ instructions: false })).toEqual({
      instructions: false,
    });
  });
});
