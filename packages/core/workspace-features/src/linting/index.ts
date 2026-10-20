// Rule-context types and narrow file accessor interfaces
// Catalog table — the exhaustive group -> rules / group -> contexts mapping
// the runner drives off.
export { type LintView } from "./catalog-contexts.js";

// `--json` document schema + derived types
export {
  LintJsonDocumentSchema,
  LintJsonFindingSchema,
  type LintJsonDocument,
} from "./json-schema.js";
export { findingsForProjectionOwnership } from "./catalog/workspace/projection-ownership-valid.js";
// Lint runner (Phase 5) — reusable primitives the `axm lint` CLI composes
// over. Keeps the CLI command file a thin surface over flag parsing and
// rendering per task 5.11.
export { type FindingCounts, type RenderedFinding } from "./runner.js";
export { DETERMINED_REPAIR_RULE_IDS } from "./run/settings.js";

// Rule catalogs and their stable metadata.
export { allCatalogErrorRuleIds, allCatalogRuleIds } from "./catalog/index.js";

// Lint-run policy: root resolution, settings-derived configuration,
// determined repairs, staged Git-index input, and path remapping.
export { LintStagingFailed } from "./run/errors.js";
export { remapLintSummaryPaths, resolveLintRoot } from "./run/settings.js";

// The lint application API: admit a request, then report the workspace's
// facts (or repair the determined ones first).
export {
  LintWorkspace,
  lintSelectionRoot,
  lintSelectionLayer,
  queryLintWorkspace,
  type LintSelection,
  type LintWorkspaceResult,
} from "./run/lint-workspace.js";

// Dependents' inferred types name these, so their declaration emit must be
// able to; knip skips exports tagged public.
/** @public */
export type { LintWorkspaceRequirements } from "./run/lint-workspace.js";
