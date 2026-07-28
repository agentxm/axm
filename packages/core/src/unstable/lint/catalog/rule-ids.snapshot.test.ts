/**
 * Rule-id snapshot test — pins the exported catalog rule ids as public API.
 *
 * Per `docs/design/lint-engine.md §8` and the Phase 3a task contract, this
 * snapshot lands with the first catalog PR (not at v1 ship). Renames require
 * deprecation aliases; a rename that drops the old id will fail this snapshot.
 *
 * **Approach.** This snapshot reads ids from whatever catalogs exist at test
 * time rather than hard-coding `[...skillRules, ...packRules,
 * ...workspaceRules]`. Phase 3a is the only catalog landed; Phase 3b and 3c
 * will each extend this test by importing their catalog and concatenating its
 * ids with a section header in the snapshot. When all three catalogs exist the
 * snapshot will be a superset of today's. The catalog/index barrel exports
 * whatever catalogs currently exist so later phases add by extending the
 * barrel rather than by touching every test.
 *
 * The snapshot is a plain JSON array so diffs are readable and merge conflicts
 * between parallel Phase 3b / 3c work land at single-line granularity.
 *
 * **Migration notes.** No id has been renamed or removed, so no deprecation
 * alias is in play. Additions only:
 *
 * - AXM-1136 appended `<type>/standalone-declaration-valid` and
 *   `<type>/recommended-packs-valid` to each of the six non-pack catalogs, and
 *   `workspace/recommended-packs-retained` to the workspace catalog. All ship
 *   at `warning` per the authoring guide's "new rules start soft" clause.
 */

import { describe, expect, it } from "vitest";
import { allCatalogRuleIds } from "./index.js";

describe("catalog rule-id snapshot", () => {
  it("matches the pinned id snapshot", () => {
    // The snapshot freezes the ids in declaration order per catalog, then
    // catalogs in the order they were added to the catalog/index barrel.
    expect(allCatalogRuleIds).toMatchSnapshot();
  });
});
