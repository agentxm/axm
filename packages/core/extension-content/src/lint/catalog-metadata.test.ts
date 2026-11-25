import { describe, expect, it } from "vitest";

import { lintCatalogRuleMetadata } from "./catalog-metadata.js";

describe("lint catalog metadata", () => {
  it("disables exactly the explicitly configured conformance rules by default", () => {
    expect(
      lintCatalogRuleMetadata
        .filter((entry) => entry.enabledByDefault === false)
        .map((entry) => entry.id),
    ).toEqual([
      "skill/frontmatter-parseable",
      "skill/frontmatter-standard-valid",
      "skill/named-extensions-declared",
    ]);
  });
});
