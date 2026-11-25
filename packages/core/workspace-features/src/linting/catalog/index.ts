/**
 * Complete executable lint catalog and its observable metadata.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import {
  type LintCatalogRuleMetadata,
  extensionLintCatalogRuleMetadata,
} from "@agentxm/extension-content/lint";
import { workspaceRules } from "./workspace.js";
import { repositoryWorkspaceRules } from "./workspace.js";
export { liveOnlyWorkspaceRules, repositoryWorkspaceRules, workspaceRules } from "./workspace.js";
// Workspace read-model builder helpers.
export { buildLintWorkspace } from "./workspace-read-model/lint-workspace.js";
const repositoryViews = Object.freeze(["filesystem", "git-index"] as const);
const liveWorkspaceView = Object.freeze(["filesystem"] as const);

const repositoryWorkspaceRuleIds = new Set(repositoryWorkspaceRules.map((rule) => rule.id));

/** Extension-type metadata plus metadata derived from the executable workspace rules. */
export const allCatalogRuleMetadata: ReadonlyArray<LintCatalogRuleMetadata> = Object.freeze([
  ...extensionLintCatalogRuleMetadata,
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
