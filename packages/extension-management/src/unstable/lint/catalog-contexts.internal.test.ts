import { describe, expect, it } from "vitest";

import {
  LINT_CATALOGS,
  LIVE_ONLY_LINT_CATALOGS,
  REPOSITORY_LINT_CATALOGS,
  lintCatalogsForView,
} from "./catalog-contexts.js";
import { workspaceRules } from "./catalog/workspace.js";

describe("lint catalog views", () => {
  it("selects repository rules positively for Git-index input", () => {
    expect(lintCatalogsForView("git-index")).toEqual(REPOSITORY_LINT_CATALOGS);
  });

  it("adds every live-only rule for workspace input", () => {
    expect(lintCatalogsForView("workspace").workspace).toEqual(workspaceRules);
    expect(new Set(workspaceRules)).toEqual(
      new Set([...REPOSITORY_LINT_CATALOGS.workspace, ...LIVE_ONLY_LINT_CATALOGS.workspace]),
    );
    expect(LINT_CATALOGS).toEqual(lintCatalogsForView("workspace"));
  });
});
