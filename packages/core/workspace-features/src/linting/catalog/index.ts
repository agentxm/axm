/**
 * Complete executable lint catalog and its observable metadata.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import {
  type LintCatalogGroup,
  type LintCatalogRuleMetadata,
  type LintCatalogView,
  skillRules,
  packRules,
  subagentRules,
  mcpServerRules,
  hookRules,
  ruleRules,
  knowledgeRules,
  type LintRule,
} from "@agentxm/extension-content/lint";
import { workspaceRules } from "./workspace.js";
import { repositoryWorkspaceRules } from "./workspace.js";
export { liveOnlyWorkspaceRules, repositoryWorkspaceRules, workspaceRules } from "./workspace.js";
// Workspace read-model builder helpers.
export {
  buildLintWorkspace,
  buildAcquiredInstalledSkillInfo,
  acquiredSkillDisplayRoot,
  type BuildLintWorkspaceArgs,
  type BuildAcquiredInstalledSkillInfoArgs,
  type LintWorkspaceBuild,
  type LintWorkspaceView,
} from "./workspace-read-model/lint-workspace.js";
const repositoryViews = Object.freeze(["filesystem", "git-index"] as const);
const liveWorkspaceView = Object.freeze(["filesystem"] as const);

const describeRules = <C>(
  group: LintCatalogGroup,
  rules: ReadonlyArray<LintRule<C>>,
  views: ReadonlyArray<LintCatalogView>,
): ReadonlyArray<LintCatalogRuleMetadata> =>
  rules.map((rule) => ({
    id: rule.id,
    defaultSeverity: rule.severity,
    ...(rule.enabledByDefault === false ? { enabledByDefault: false as const } : {}),
    group,
    views,
  }));

const repositoryWorkspaceRuleIds = new Set(repositoryWorkspaceRules.map((rule) => rule.id));

/** Metadata derived from the executable rules and their view catalogs. */
export const allCatalogRuleMetadata: ReadonlyArray<LintCatalogRuleMetadata> = Object.freeze([
  ...describeRules("skill", skillRules, repositoryViews),
  ...describeRules("pack", packRules, repositoryViews),
  ...describeRules("subagent", subagentRules, repositoryViews),
  ...describeRules("mcp-server", mcpServerRules, repositoryViews),
  ...describeRules("hook", hookRules, repositoryViews),
  ...describeRules("rule", ruleRules, repositoryViews),
  ...describeRules("knowledge", knowledgeRules, repositoryViews),
  ...workspaceRules.map((rule) => ({
    id: rule.id,
    defaultSeverity: rule.severity,
    ...(rule.enabledByDefault === false ? { enabledByDefault: false as const } : {}),
    group: "workspace" as const,
    views: repositoryWorkspaceRuleIds.has(rule.id) ? repositoryViews : liveWorkspaceView,
  })),
]);

/** Every executable lint-rule identity, in catalog/reporting order. */
export const allCatalogRuleIds: ReadonlyArray<string> = Object.freeze(
  allCatalogRuleMetadata.map((entry) => entry.id),
);

/** Error-severity rule identities that require an exhaustive recovery contract. */
export const allCatalogErrorRuleIds: ReadonlyArray<string> = Object.freeze(
  allCatalogRuleMetadata
    .filter((entry) => entry.defaultSeverity === "error")
    .map((entry) => entry.id),
);
