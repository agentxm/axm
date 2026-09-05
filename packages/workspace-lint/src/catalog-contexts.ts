/**
 * The lint runner's catalog table — one entry per rule namespace, total by
 * construction over `ExtensionType`.
 *
 * `axm lint` used to name its catalogs seven times over (an import list, a
 * group union, an evaluation tuple, a rendering list, a drift-detection call
 * sequence), and a catalog could be — and was — added to the barrel while
 * being silently skipped by the runner: `hookRules` shipped evaluated by the
 * publish gate but never by `axm lint`.
 *
 * Now every catalog is a key of {@link CatalogRuleContexts} and a row of
 * {@link LINT_CATALOGS}. Because the table is checked against
 * `Record<ExtensionType | "workspace", ...>`, adding an extension type to
 * `EXTENSION_TYPE_TABLE` fails compile here until its catalog is decided, and
 * deleting a key from `CatalogRuleContexts` fails compile at the row that
 * indexes it.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { hookRules } from "@agentxm/registry-protocol/unstable/lint/catalog/hook";
import { knowledgeRules } from "@agentxm/registry-protocol/unstable/lint/catalog/knowledge";
import { mcpServerRules } from "@agentxm/registry-protocol/unstable/lint/catalog/mcp-server";
import { packRules } from "@agentxm/registry-protocol/unstable/lint/catalog/pack";
import { ruleRules } from "@agentxm/registry-protocol/unstable/lint/catalog/rule";
import { skillRules } from "@agentxm/registry-protocol/unstable/lint/catalog/skill";
import { subagentRules } from "@agentxm/registry-protocol/unstable/lint/catalog/subagent";
import {
  liveOnlyWorkspaceRules,
  repositoryWorkspaceRules,
  workspaceRules,
} from "./catalog/index.js";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions/common";
import type {
  HookRuleContext,
  KnowledgeRuleContext,
  McpServerRuleContext,
  PackRuleContext,
  RuleRuleContext,
  SkillRuleContext,
  SubagentRuleContext,
} from "@agentxm/registry-protocol/unstable/lint/context";
import type { WorkspaceRuleContext } from "./workspace-context.js";
import type { LintRule } from "@agentxm/registry-protocol/unstable/lint/rule";

/**
 * The contexts a full lint run evaluates, one array per catalog.
 *
 * `workspace` is the one pseudo-group: it is not an extension type, and it
 * always carries exactly the single workspace context.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface CatalogRuleContexts {
  readonly skill: ReadonlyArray<SkillRuleContext>;
  readonly pack: ReadonlyArray<PackRuleContext>;
  readonly subagent: ReadonlyArray<SubagentRuleContext>;
  readonly "mcp-server": ReadonlyArray<McpServerRuleContext>;
  readonly rule: ReadonlyArray<RuleRuleContext>;
  readonly hook: ReadonlyArray<HookRuleContext>;
  readonly knowledge: ReadonlyArray<KnowledgeRuleContext>;
  readonly workspace: ReadonlyArray<WorkspaceRuleContext>;
}

/**
 * A catalog key: every extension type, plus the `workspace` pseudo-group.
 *
 * Declared from `ExtensionType` rather than `keyof CatalogRuleContexts`, so
 * the two must agree: a new extension type leaves `CatalogRuleContexts`
 * missing a key, and a deleted `CatalogRuleContexts` key leaves
 * {@link CatalogContext} indexing a key that no longer exists. Either way the
 * build fails until the catalog is decided.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type CatalogGroup = ExtensionType | "workspace";

/** Filesystem identity evaluated by a lint run. */
export type LintView = "workspace" | "git-index";

/** The context type a given catalog's rules consume. */
export type CatalogContext<K extends CatalogGroup> = CatalogRuleContexts[K][number];

/**
 * Every rule catalog, keyed by group.
 *
 * The annotation is the totality gate: the key set is `ExtensionType |
 * "workspace"`, and each value is checked against the context type
 * `CatalogRuleContexts` declares for that key.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const REPOSITORY_LINT_CATALOGS: {
  readonly [K in CatalogGroup]: ReadonlyArray<LintRule<CatalogContext<K>>>;
} = {
  skill: skillRules,
  pack: packRules,
  subagent: subagentRules,
  "mcp-server": mcpServerRules,
  rule: ruleRules,
  hook: hookRules,
  knowledge: knowledgeRules,
  workspace: repositoryWorkspaceRules,
};

/** Positive catalog of rules that require live operational state. */
export const LIVE_ONLY_LINT_CATALOGS = {
  workspace: liveOnlyWorkspaceRules,
} satisfies { readonly workspace: ReadonlyArray<LintRule<WorkspaceRuleContext>> };

/** Select positive rule catalogs for a view without an exclusion list. */
export const lintCatalogsForView = (
  view: LintView,
): { readonly [K in CatalogGroup]: ReadonlyArray<LintRule<CatalogContext<K>>> } => ({
  ...REPOSITORY_LINT_CATALOGS,
  workspace: view === "workspace" ? workspaceRules : REPOSITORY_LINT_CATALOGS.workspace,
});

/** Complete workspace catalog retained for callers that do not select a view. */
export const LINT_CATALOGS = lintCatalogsForView("workspace");

/**
 * Catalog evaluation and rendering order.
 *
 * Findings render group-by-group in this order and the order is
 * test-observable, so it is declared explicitly rather than derived from
 * object key order. It matches `allCatalogRuleIds` in the catalog barrel;
 * `workspace` stays last.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const CATALOG_GROUP_ORDER = [
  "skill",
  "pack",
  "subagent",
  "mcp-server",
  "hook",
  "rule",
  "knowledge",
  "workspace",
] as const satisfies ReadonlyArray<CatalogGroup>;

/**
 * An empty context record. Callers that evaluate only some catalogs spread
 * this so adding a catalog does not silently skip them.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const emptyCatalogRuleContexts: CatalogRuleContexts = {
  skill: [],
  pack: [],
  subagent: [],
  "mcp-server": [],
  rule: [],
  hook: [],
  knowledge: [],
  workspace: [],
};
