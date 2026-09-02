import { describe, expect, it } from "vitest";

import { lintCatalogRuleMetadata } from "@agentxm/registry-protocol/unstable/lint/catalog-metadata";
import { allCatalogRuleMetadata } from "./index.js";
import { workspaceRules } from "./workspace.js";

describe("executable lint catalog metadata", () => {
  it("matches the static configuration contract exactly", () => {
    expect(allCatalogRuleMetadata).toEqual(lintCatalogRuleMetadata);
  });

  it("keeps workspace rules namespaced, fact-only, and documented", () => {
    for (const rule of workspaceRules) {
      expect(rule.id.startsWith("workspace/"), rule.id).toBe(true);
      expect(rule.kind, rule.id).toBe("advisory");
      expect(rule.description.length, `${rule.id} description`).toBeGreaterThan(0);
      expect(rule.description.length, `${rule.id} description`).toBeLessThanOrEqual(100);
    }
  });
});
