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
    const repositoryRuleIds = REPOSITORY_LINT_CATALOGS.workspace.map((rule) => rule.id);
    const liveOnlyRuleIds = LIVE_ONLY_LINT_CATALOGS.workspace.map((rule) => rule.id);
    expect(repositoryRuleIds).toEqual(
      workspaceRules.filter((rule) => !liveOnlyRuleIds.includes(rule.id)).map((rule) => rule.id),
    );
    expect(liveOnlyRuleIds).toEqual(
      workspaceRules.filter((rule) => !repositoryRuleIds.includes(rule.id)).map((rule) => rule.id),
    );
    expect(repositoryRuleIds).toHaveLength(new Set(repositoryRuleIds).size);
    expect(liveOnlyRuleIds).toHaveLength(new Set(liveOnlyRuleIds).size);
    expect(repositoryRuleIds.some((id) => liveOnlyRuleIds.includes(id))).toBe(false);
    expect(repositoryRuleIds.length + liveOnlyRuleIds.length).toBe(workspaceRules.length);
    expect(LINT_CATALOGS).toEqual(lintCatalogsForView("workspace"));
  });
});
