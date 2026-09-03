/**
 * Static metadata for every lint rule accepted by workspace settings.
 *
 * This catalog is deliberately independent of executable rule modules. The
 * settings schema and generated JSON Schema must know the complete rule-id
 * vocabulary without relying on catalog imports or module-load side effects.
 * Executable catalogs are checked against this contract separately.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions/common";
import type { Severity } from "./rule.js";

/** A rule-catalog namespace: every extension type plus the workspace itself. */
export type LintCatalogGroup = ExtensionType | "workspace";

/** Filesystem identity against which a rule can execute. */
export type LintCatalogView = "workspace" | "git-index";

/** Stable configuration and execution metadata for one lint rule. */
export interface LintCatalogRuleMetadata {
  readonly id: string;
  readonly defaultSeverity: Severity;
  readonly group: LintCatalogGroup;
  readonly views: ReadonlyArray<LintCatalogView>;
}

const bothViews = Object.freeze(["workspace", "git-index"] as const);
const workspaceView = Object.freeze(["workspace"] as const);

const defineLintCatalog = <const Entries extends ReadonlyArray<LintCatalogRuleMetadata>>(
  entries: Entries,
) => {
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
    if (entry.views.includes("git-index") && !entry.views.includes("workspace")) {
      throw new Error(`Git-index lint rule '${entry.id}' must also run against the workspace view`);
    }
    ids.add(entry.id);
  }
  return Object.freeze(entries);
};

/**
 * Complete ordered lint-rule contract.
 *
 * Order is the public reporting order: extension catalogs first, then
 * workspace rules. A rule listed for `git-index` must also be listed for the
 * live `workspace` view.
 */
export const lintCatalogRuleMetadata = defineLintCatalog([
  { id: "skill/skill-md-present", defaultSeverity: "error", group: "skill", views: bothViews },
  { id: "skill/manifest-present", defaultSeverity: "error", group: "skill", views: bothViews },
  { id: "skill/frontmatter-parseable", defaultSeverity: "error", group: "skill", views: bothViews },
  {
    id: "skill/frontmatter-standard-valid",
    defaultSeverity: "error",
    group: "skill",
    views: bothViews,
  },
  {
    id: "skill/manifest-schema-valid",
    defaultSeverity: "error",
    group: "skill",
    views: bothViews,
  },
  {
    id: "skill/manifest-keys-recognized",
    defaultSeverity: "error",
    group: "skill",
    views: bothViews,
  },
  {
    id: "skill/standalone-declaration-valid",
    defaultSeverity: "warning",
    group: "skill",
    views: bothViews,
  },
  {
    id: "skill/recommended-packs-valid",
    defaultSeverity: "warning",
    group: "skill",
    views: bothViews,
  },
  { id: "pack/manifest-present", defaultSeverity: "error", group: "pack", views: bothViews },
  {
    id: "pack/manifest-schema-valid",
    defaultSeverity: "error",
    group: "pack",
    views: bothViews,
  },
  {
    id: "pack/manifest-keys-recognized",
    defaultSeverity: "error",
    group: "pack",
    views: bothViews,
  },
  {
    id: "subagent/manifest-present",
    defaultSeverity: "error",
    group: "subagent",
    views: bothViews,
  },
  {
    id: "subagent/manifest-schema-valid",
    defaultSeverity: "error",
    group: "subagent",
    views: bothViews,
  },
  {
    id: "subagent/manifest-keys-recognized",
    defaultSeverity: "error",
    group: "subagent",
    views: bothViews,
  },
  {
    id: "subagent/standalone-declaration-valid",
    defaultSeverity: "warning",
    group: "subagent",
    views: bothViews,
  },
  {
    id: "subagent/recommended-packs-valid",
    defaultSeverity: "warning",
    group: "subagent",
    views: bothViews,
  },
  {
    id: "mcp-server/manifest-present",
    defaultSeverity: "error",
    group: "mcp-server",
    views: bothViews,
  },
  {
    id: "mcp-server/manifest-schema-valid",
    defaultSeverity: "error",
    group: "mcp-server",
    views: bothViews,
  },
  {
    id: "mcp-server/manifest-keys-recognized",
    defaultSeverity: "error",
    group: "mcp-server",
    views: bothViews,
  },
  {
    id: "mcp-server/standalone-declaration-valid",
    defaultSeverity: "warning",
    group: "mcp-server",
    views: bothViews,
  },
  {
    id: "mcp-server/recommended-packs-valid",
    defaultSeverity: "warning",
    group: "mcp-server",
    views: bothViews,
  },
  { id: "hook/manifest-present", defaultSeverity: "error", group: "hook", views: bothViews },
  {
    id: "hook/manifest-schema-valid",
    defaultSeverity: "error",
    group: "hook",
    views: bothViews,
  },
  {
    id: "hook/manifest-keys-recognized",
    defaultSeverity: "error",
    group: "hook",
    views: bothViews,
  },
  {
    id: "hook/decision-portability",
    defaultSeverity: "warning",
    group: "hook",
    views: bothViews,
  },
  {
    id: "hook/matcher-raw-portability",
    defaultSeverity: "warning",
    group: "hook",
    views: bothViews,
  },
  { id: "hook/entrypoint-exists", defaultSeverity: "error", group: "hook", views: bothViews },
  {
    id: "hook/standalone-declaration-valid",
    defaultSeverity: "warning",
    group: "hook",
    views: bothViews,
  },
  {
    id: "hook/recommended-packs-valid",
    defaultSeverity: "warning",
    group: "hook",
    views: bothViews,
  },
  { id: "rule/manifest-present", defaultSeverity: "error", group: "rule", views: bothViews },
  {
    id: "rule/manifest-schema-valid",
    defaultSeverity: "error",
    group: "rule",
    views: bothViews,
  },
  {
    id: "rule/manifest-keys-recognized",
    defaultSeverity: "error",
    group: "rule",
    views: bothViews,
  },
  {
    id: "rule/standalone-declaration-valid",
    defaultSeverity: "warning",
    group: "rule",
    views: bothViews,
  },
  {
    id: "rule/recommended-packs-valid",
    defaultSeverity: "warning",
    group: "rule",
    views: bothViews,
  },
  {
    id: "knowledge/manifest-present",
    defaultSeverity: "error",
    group: "knowledge",
    views: bothViews,
  },
  {
    id: "knowledge/manifest-schema-valid",
    defaultSeverity: "error",
    group: "knowledge",
    views: bothViews,
  },
  {
    id: "knowledge/manifest-keys-recognized",
    defaultSeverity: "error",
    group: "knowledge",
    views: bothViews,
  },
  {
    id: "knowledge/standalone-declaration-valid",
    defaultSeverity: "warning",
    group: "knowledge",
    views: bothViews,
  },
  {
    id: "knowledge/recommended-packs-valid",
    defaultSeverity: "warning",
    group: "knowledge",
    views: bothViews,
  },
  {
    id: "knowledge/bundle-too-large",
    defaultSeverity: "error",
    group: "knowledge",
    views: bothViews,
  },
  {
    id: "knowledge/file-too-large",
    defaultSeverity: "error",
    group: "knowledge",
    views: bothViews,
  },
  { id: "knowledge/invalid-tags", defaultSeverity: "error", group: "knowledge", views: bothViews },
  {
    id: "knowledge/missing-root-index",
    defaultSeverity: "error",
    group: "knowledge",
    views: bothViews,
  },
  {
    id: "knowledge/missing-okf-version",
    defaultSeverity: "error",
    group: "knowledge",
    views: bothViews,
  },
  {
    id: "knowledge/missing-title",
    defaultSeverity: "warning",
    group: "knowledge",
    views: bothViews,
  },
  {
    id: "knowledge/missing-description",
    defaultSeverity: "warning",
    group: "knowledge",
    views: bothViews,
  },
  {
    id: "knowledge/missing-manifest-description",
    defaultSeverity: "warning",
    group: "knowledge",
    views: bothViews,
  },
  {
    id: "knowledge/empty-bundle",
    defaultSeverity: "warning",
    group: "knowledge",
    views: bothViews,
  },
  {
    id: "knowledge/missing-tags",
    defaultSeverity: "warning",
    group: "knowledge",
    views: bothViews,
  },
  { id: "knowledge/symbolic-link", defaultSeverity: "error", group: "knowledge", views: bothViews },
  {
    id: "knowledge/too-many-files",
    defaultSeverity: "error",
    group: "knowledge",
    views: bothViews,
  },
  {
    id: "knowledge/unsupported-okf-version",
    defaultSeverity: "error",
    group: "knowledge",
    views: bothViews,
  },
  { id: "knowledge/missing-type", defaultSeverity: "error", group: "knowledge", views: bothViews },
  {
    id: "knowledge/invalid-frontmatter",
    defaultSeverity: "error",
    group: "knowledge",
    views: bothViews,
  },
  {
    id: "knowledge/case-collision",
    defaultSeverity: "error",
    group: "knowledge",
    views: bothViews,
  },
  { id: "knowledge/dangerous-uri", defaultSeverity: "error", group: "knowledge", views: bothViews },
  {
    id: "knowledge/detected-secret",
    defaultSeverity: "error",
    group: "knowledge",
    views: bothViews,
  },
  { id: "knowledge/unsafe-path", defaultSeverity: "error", group: "knowledge", views: bothViews },
  { id: "knowledge/invalid-index", defaultSeverity: "error", group: "knowledge", views: bothViews },
  { id: "knowledge/invalid-log", defaultSeverity: "error", group: "knowledge", views: bothViews },
  {
    id: "knowledge/invalid-resource",
    defaultSeverity: "error",
    group: "knowledge",
    views: bothViews,
  },
  {
    id: "knowledge/escaping-resource",
    defaultSeverity: "error",
    group: "knowledge",
    views: bothViews,
  },
  {
    id: "knowledge/unresolved-resource",
    defaultSeverity: "warning",
    group: "knowledge",
    views: bothViews,
  },
  {
    id: "knowledge/broken-internal-link",
    defaultSeverity: "warning",
    group: "knowledge",
    views: bothViews,
  },
  {
    id: "knowledge/escaping-link",
    defaultSeverity: "warning",
    group: "knowledge",
    views: bothViews,
  },
  {
    id: "knowledge/unreachable-concept",
    defaultSeverity: "warning",
    group: "knowledge",
    views: bothViews,
  },
  {
    id: "knowledge/missing-index-entry",
    defaultSeverity: "warning",
    group: "knowledge",
    views: bothViews,
  },
  {
    id: "knowledge/stale-index-entry",
    defaultSeverity: "warning",
    group: "knowledge",
    views: bothViews,
  },
  {
    id: "knowledge/embedded-html",
    defaultSeverity: "warning",
    group: "knowledge",
    views: bothViews,
  },
  {
    id: "knowledge/duplicate-resource",
    defaultSeverity: "warning",
    group: "knowledge",
    views: bothViews,
  },
  {
    id: "knowledge/inconsistent-type",
    defaultSeverity: "warning",
    group: "knowledge",
    views: bothViews,
  },
  {
    id: "knowledge/large-concept",
    defaultSeverity: "warning",
    group: "knowledge",
    views: bothViews,
  },
  { id: "knowledge/large-index", defaultSeverity: "warning", group: "knowledge", views: bothViews },
  {
    id: "knowledge/unreferenced-asset",
    defaultSeverity: "warning",
    group: "knowledge",
    views: bothViews,
  },
  {
    id: "knowledge/invalid-sources",
    defaultSeverity: "error",
    group: "knowledge",
    views: bothViews,
  },
  {
    id: "knowledge/invalid-generated",
    defaultSeverity: "error",
    group: "knowledge",
    views: bothViews,
  },
  {
    id: "knowledge/invalid-verified",
    defaultSeverity: "error",
    group: "knowledge",
    views: bothViews,
  },
  {
    id: "knowledge/invalid-status",
    defaultSeverity: "error",
    group: "knowledge",
    views: bothViews,
  },
  {
    id: "knowledge/invalid-stale-after",
    defaultSeverity: "error",
    group: "knowledge",
    views: bothViews,
  },
  {
    id: "knowledge/invalid-attestation",
    defaultSeverity: "error",
    group: "knowledge",
    views: bothViews,
  },
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
    views: workspaceView,
  },
  {
    id: "workspace/agents-projections-stale",
    defaultSeverity: "warning",
    group: "workspace",
    views: workspaceView,
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
    views: workspaceView,
  },
  {
    id: "workspace/instructions-target-unowned",
    defaultSeverity: "warning",
    group: "workspace",
    views: workspaceView,
  },
  {
    id: "workspace/instructions-target-stale",
    defaultSeverity: "warning",
    group: "workspace",
    views: workspaceView,
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
    views: workspaceView,
  },
  {
    id: "workspace/hook-ownership-ambiguous",
    defaultSeverity: "warning",
    group: "workspace",
    views: workspaceView,
  },
  {
    id: "workspace/managed-file-unowned",
    defaultSeverity: "warning",
    group: "workspace",
    views: workspaceView,
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
    views: workspaceView,
  },
  {
    id: "workspace/mcps-agent-orphaned",
    defaultSeverity: "warning",
    group: "workspace",
    views: workspaceView,
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
    views: workspaceView,
  },
  {
    id: "workspace/packs-dependencies-resolved",
    defaultSeverity: "error",
    group: "workspace",
    views: bothViews,
  },
] satisfies ReadonlyArray<LintCatalogRuleMetadata>);

/** Every accepted lint-rule identity, in catalog/reporting order. */
export const allLintCatalogRuleIds = Object.freeze(
  lintCatalogRuleMetadata.map((entry) => entry.id),
);
