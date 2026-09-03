import { describe, expect, it } from "vitest";

import { lintCatalogRuleMetadata } from "@agentxm/registry-protocol/unstable/lint/catalog-metadata";
import { CATALOG_GROUP_ORDER } from "../catalog-contexts.js";
import { allCatalogRuleMetadata } from "./index.js";
import { workspaceRules } from "./workspace.js";

describe("executable lint catalog metadata", () => {
  it("matches the static configuration contract exactly", () => {
    expect(allCatalogRuleMetadata).toEqual(lintCatalogRuleMetadata);
  });

  it("orders rules by catalog group with workspace rules last", () => {
    const groupPositions = allCatalogRuleMetadata.map((rule) =>
      CATALOG_GROUP_ORDER.indexOf(rule.group),
    );
    expect(groupPositions.every((position) => position >= 0)).toBe(true);
    expect(groupPositions).toEqual([...groupPositions].sort((left, right) => left - right));
    expect(allCatalogRuleMetadata.at(-1)?.group).toBe("workspace");
    expect(new Set(allCatalogRuleMetadata.map((rule) => rule.group))).toEqual(
      new Set(CATALOG_GROUP_ORDER),
    );
  });

  it("groups every rule under the namespace its identity carries", () => {
    for (const rule of allCatalogRuleMetadata) {
      expect(rule.group, rule.id).toBe(rule.id.slice(0, rule.id.indexOf("/")));
    }
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
