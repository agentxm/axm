/**
 * Metadata for every lint rule accepted by workspace settings.
 *
 * Extension-type metadata derives from the executable catalogs in this
 * package. Only `workspace/*` metadata is static, because those rules execute
 * in workspace-features, which the kernel settings schema cannot import.
 * workspace-features checks its executable workspace rules against this list.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions/common";
import { hookRules } from "./catalog/hook.js";
import { knowledgeRules } from "./catalog/knowledge.js";
import { mcpServerRules } from "./catalog/mcp-server.js";
import { packRules } from "./catalog/pack.js";
import { ruleRules } from "./catalog/rule.js";
import { skillRules } from "./catalog/skill.js";
import { subagentRules } from "./catalog/subagent.js";
import type { LintRule, Severity } from "./rule.js";

/** A rule-catalog namespace: every extension type plus the workspace itself. */
export type LintCatalogGroup = ExtensionType | "workspace";

/** Filesystem identity against which a rule can execute. */
export type LintCatalogView = "filesystem" | "git-index";

/** Stable configuration and execution metadata for one lint rule. */
export interface LintCatalogRuleMetadata {
  readonly id: string;
  readonly defaultSeverity: Severity;
  readonly enabledByDefault?: false;
  readonly group: LintCatalogGroup;
  readonly views: ReadonlyArray<LintCatalogView>;
}

const bothViews = Object.freeze(["filesystem", "git-index"] as const);
const filesystemView = Object.freeze(["filesystem"] as const);

const defineLintCatalog = (
  entries: ReadonlyArray<LintCatalogRuleMetadata>,
): ReadonlyArray<LintCatalogRuleMetadata> => {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) {
      throw new Error(`Duplicate lint rule id '${entry.id}' in catalog metadata`);
    }
    if (!entry.id.startsWith(`${entry.group}/`)) {
      throw new Error(`Lint rule id '${entry.id}' does not belong to group '${entry.group}'`);
    }
    if (entry.views.length === 0 || new Set(entry.views).size !== entry.views.length) {
      throw new Error(`Lint rule '${entry.id}' must declare a non-empty, unique view list`);
    }
    if (entry.views.includes("git-index") && !entry.views.includes("filesystem")) {
      throw new Error(
        `Git-index lint rule '${entry.id}' must also run against the filesystem view`,
      );
    }
    ids.add(entry.id);
  }
  return Object.freeze(entries);
};

const describe = <C>(
  group: ExtensionType,
  rules: ReadonlyArray<LintRule<C>>,
): ReadonlyArray<LintCatalogRuleMetadata> =>
  rules.map((rule) => ({
    id: rule.id,
    defaultSeverity: rule.severity,
    ...(rule.enabledByDefault === false ? { enabledByDefault: false as const } : {}),
    group,
    views: bothViews,
  }));

/** Extension-type rule metadata, derived from the executable catalogs in group order. */
export const extensionLintCatalogRuleMetadata: ReadonlyArray<LintCatalogRuleMetadata> =
  Object.freeze([
    ...describe("skill", skillRules),
    ...describe("pack", packRules),
    ...describe("subagent", subagentRules),
    ...describe("mcp-server", mcpServerRules),
    ...describe("hook", hookRules),
    ...describe("rule", ruleRules),
    ...describe("knowledge", knowledgeRules),
  ]);

const workspaceLintCatalogRuleMetadata: ReadonlyArray<LintCatalogRuleMetadata> = [
  { id: "workspace/initialized", defaultSeverity: "error", group: "workspace", views: bothViews },
  {
    id: "workspace/settings-schema-valid",
    defaultSeverity: "error",
    group: "workspace",
    views: bothViews,
  },
  {
    id: "workspace/settings-keys-recognized",
    defaultSeverity: "error",
    group: "workspace",
    views: bothViews,
  },
  {
    id: "workspace/lockfile-valid",
    defaultSeverity: "error",
    group: "workspace",
    views: bothViews,
  },
  {
    id: "workspace/source-endpoints-aligned",
    defaultSeverity: "error",
    group: "workspace",
    views: bothViews,
  },
  {
    id: "workspace/desired-state-reconcilable",
    defaultSeverity: "error",
    group: "workspace",
    views: bothViews,
  },
  {
    id: "workspace/axm-skill-declared",
    defaultSeverity: "info",
    group: "workspace",
    views: bothViews,
  },
  {
    id: "workspace/axm-skill-compatible",
    defaultSeverity: "error",
    group: "workspace",
    views: bothViews,
  },
  {
    id: "workspace/agents-recognized",
    defaultSeverity: "error",
    group: "workspace",
    views: bothViews,
  },
  {
    id: "workspace/agents-detected-declared",
    defaultSeverity: "warning",
    group: "workspace",
    views: filesystemView,
  },
  {
    id: "workspace/agents-projections-stale",
    defaultSeverity: "warning",
    group: "workspace",
    views: filesystemView,
  },
  {
    id: "workspace/instructions-source-present",
    defaultSeverity: "error",
    group: "workspace",
    views: bothViews,
  },
  {
    id: "workspace/instructions-target-current",
    defaultSeverity: "warning",
    group: "workspace",
    views: filesystemView,
  },
  {
    id: "workspace/instructions-target-unowned",
    defaultSeverity: "warning",
    group: "workspace",
    views: filesystemView,
  },
  {
    id: "workspace/instructions-target-stale",
    defaultSeverity: "warning",
    group: "workspace",
    views: filesystemView,
  },
  {
    id: "workspace/instructions-agent-supported",
    defaultSeverity: "warning",
    group: "workspace",
    views: bothViews,
  },
  {
    id: "workspace/instructions-gitignore-current",
    defaultSeverity: "info",
    group: "workspace",
    views: bothViews,
  },
  {
    id: "workspace/projection-ownership-valid",
    defaultSeverity: "error",
    group: "workspace",
    views: filesystemView,
  },
  {
    id: "workspace/projection-contributors-rendered",
    defaultSeverity: "warning",
    group: "workspace",
    views: filesystemView,
  },
  {
    id: "workspace/projection-modified",
    defaultSeverity: "info",
    group: "workspace",
    views: filesystemView,
  },
  {
    id: "workspace/unknown-axm-fence",
    defaultSeverity: "info",
    group: "workspace",
    views: filesystemView,
  },
  {
    id: "workspace/managed-file-unowned",
    defaultSeverity: "warning",
    group: "workspace",
    views: filesystemView,
  },
  {
    id: "workspace/installed-but-not-configured",
    defaultSeverity: "warning",
    group: "workspace",
    views: filesystemView,
  },
  {
    id: "workspace/authored-package-declared",
    defaultSeverity: "warning",
    group: "workspace",
    views: filesystemView,
  },
  {
    id: "workspace/install-root-entries-recognized",
    defaultSeverity: "warning",
    group: "workspace",
    views: filesystemView,
  },
  {
    id: "workspace/project-outputs-not-shadowed",
    defaultSeverity: "warning",
    group: "workspace",
    views: filesystemView,
  },
  {
    id: "workspace/exposed-axm-skill-compatible",
    defaultSeverity: "warning",
    group: "workspace",
    views: filesystemView,
  },
  {
    id: "workspace/native-output-links-resolve",
    defaultSeverity: "warning",
    group: "workspace",
    views: filesystemView,
  },
  {
    id: "workspace/native-outputs-readable",
    defaultSeverity: "warning",
    group: "workspace",
    views: filesystemView,
  },
  {
    id: "workspace/user-outputs-have-settings",
    defaultSeverity: "warning",
    group: "workspace",
    views: filesystemView,
  },
  {
    id: "workspace/agent-content-has-settings",
    defaultSeverity: "warning",
    group: "workspace",
    views: filesystemView,
  },
  {
    id: "workspace/skills-declarations-valid",
    defaultSeverity: "error",
    group: "workspace",
    views: bothViews,
  },
  {
    id: "workspace/packs-declarations-valid",
    defaultSeverity: "error",
    group: "workspace",
    views: bothViews,
  },
  {
    id: "workspace/packs-shared-members-distributable",
    defaultSeverity: "error",
    group: "workspace",
    views: bothViews,
  },
  {
    id: "workspace/configured-but-not-installed",
    defaultSeverity: "error",
    group: "workspace",
    views: bothViews,
  },
  {
    id: "workspace/knowledge-state-valid",
    defaultSeverity: "error",
    group: "workspace",
    views: bothViews,
  },
  {
    id: "workspace/mcps-transport-exclusivity",
    defaultSeverity: "warning",
    group: "workspace",
    views: bothViews,
  },
  {
    id: "workspace/mcps-no-secret-literal",
    defaultSeverity: "warning",
    group: "workspace",
    views: bothViews,
  },
  {
    id: "workspace/mcps-agent-drift",
    defaultSeverity: "warning",
    group: "workspace",
    views: filesystemView,
  },
  {
    id: "workspace/skills-lockfile-aligned",
    defaultSeverity: "error",
    group: "workspace",
    views: bothViews,
  },
  {
    id: "workspace/skills-integrity-valid",
    defaultSeverity: "error",
    group: "workspace",
    views: bothViews,
  },
  {
    id: "workspace/skills-artifacts-correct",
    defaultSeverity: "error",
    group: "workspace",
    views: filesystemView,
  },
  {
    id: "workspace/packs-dependencies-resolved",
    defaultSeverity: "error",
    group: "workspace",
    views: bothViews,
  },
];

/**
 * Complete ordered lint-rule contract.
 *
 * Order is the public reporting order: extension catalogs first, then
 * workspace rules. A rule listed for `git-index` must also be listed for the
 * live `filesystem` view.
 */
export const lintCatalogRuleMetadata = defineLintCatalog([
  ...extensionLintCatalogRuleMetadata,
  ...workspaceLintCatalogRuleMetadata,
]);

/** Every accepted lint-rule identity, in catalog/reporting order. */
export const allLintCatalogRuleIds = Object.freeze(
  lintCatalogRuleMetadata.map((entry) => entry.id),
);
