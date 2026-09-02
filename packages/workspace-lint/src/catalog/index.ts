/**
 * Complete executable lint catalog and its observable metadata.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type {
  LintCatalogGroup,
  LintCatalogRuleMetadata,
  LintCatalogView,
} from "@agentxm/registry-protocol/unstable/lint/catalog-metadata";
import { skillRules } from "@agentxm/registry-protocol/unstable/lint/catalog/skill";
import { packRules } from "@agentxm/registry-protocol/unstable/lint/catalog/pack";
import { subagentRules } from "@agentxm/registry-protocol/unstable/lint/catalog/subagent";
import { mcpServerRules } from "@agentxm/registry-protocol/unstable/lint/catalog/mcp-server";
import { hookRules } from "@agentxm/registry-protocol/unstable/lint/catalog/hook";
import { ruleRules } from "@agentxm/registry-protocol/unstable/lint/catalog/rule";
import { knowledgeRules } from "@agentxm/registry-protocol/unstable/lint/catalog/knowledge";
import type { LintRule } from "@agentxm/registry-protocol/unstable/lint/rule";
import { workspaceRules } from "./workspace.js";
import { repositoryWorkspaceRules } from "./workspace.js";
export { liveOnlyWorkspaceRules, repositoryWorkspaceRules, workspaceRules } from "./workspace.js";
// Workspace read-model builder helpers.
export {
  buildLintWorkspace,
  buildNativeInstalledSkillInfo,
  buildAcquiredInstalledSkillInfo,
  buildInstalledPackInfo,
  acquiredSkillDisplayRoot,
  registryNativeSkillDisplayRoot,
  registryPackDisplayRoot,
  type BuildLintWorkspaceArgs,
  type BuildInstalledPackInfoArgs,
  type BuildAcquiredInstalledSkillInfoArgs,
  type BuildInstalledSkillInfoNativeArgs,
  type LintWorkspace,
  type LintWorkspaceView,
} from "./workspace-read-model/lint-workspace.js";
const repositoryViews = Object.freeze(["workspace", "git-index"] as const);
const liveWorkspaceView = Object.freeze(["workspace"] as const);

const describeRules = <C>(
  group: LintCatalogGroup,
  rules: ReadonlyArray<LintRule<C>>,
  views: ReadonlyArray<LintCatalogView>,
): ReadonlyArray<LintCatalogRuleMetadata> =>
  rules.map((rule) => ({
    id: rule.id,
    defaultSeverity: rule.severity,
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
