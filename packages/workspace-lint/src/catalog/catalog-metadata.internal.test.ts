import { describe, expect, it } from "vitest";

import { lintCatalogRuleMetadata } from "@agentxm/registry-protocol/unstable/lint/catalog-metadata";
import { allCatalogRuleMetadata } from "./index.js";

describe("executable lint catalog metadata", () => {
  it("matches the static configuration contract exactly", () => {
    expect(allCatalogRuleMetadata).toEqual(lintCatalogRuleMetadata);
  });
});
