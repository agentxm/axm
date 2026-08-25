/**
 * Catalog barrel — aggregates the per-namespace rule catalogs for consumers
 * that want the full v1 rule set.
 *
 * Phase 3a lands `skillRules`; Phase 3b lands `packRules`; Phase 3c will
 * append `workspaceRules` without touching existing imports.
 *
 * `allCatalogRuleIds` is the concatenation used by the rule-id snapshot test
 * (`./rule-ids.snapshot.test.ts`). Per-catalog consumers (registry publish,
 * `axm lint`) should import the specific catalog they need so the other
 * catalogs tree-shake out.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { skillRules } from "./skill.js";
import { packRules } from "./pack.js";
import { subagentRules } from "./subagent.js";
import { mcpServerRules } from "./mcp-server.js";
import { hookRules } from "./hook.js";
import { ruleRules } from "./rule.js";
import { knowledgeRules } from "./knowledge.js";
import { workspaceRules } from "./workspace.js";

export { skillRules } from "./skill.js";
export { packRules } from "./pack.js";
export { subagentRules } from "./subagent.js";
export { mcpServerRules } from "./mcp-server.js";
export { hookRules } from "./hook.js";
export { ruleRules } from "./rule.js";
export { knowledgeRules } from "./knowledge.js";
export { liveOnlyWorkspaceRules, repositoryWorkspaceRules, workspaceRules } from "./workspace.js";

// Phase 3a accessor + context-builder helpers.
export {
  makeVftSkillFileAccessor,
  makeVftSkillFileAccessorScoped,
  type VFTNode,
} from "./skill-accessor/vft.js";
export {
  makePlatformSkillFileAccessor,
  type SkillAccessorPlatform,
} from "./skill-accessor/platform.js";
export { buildSkillRuleContexts, type InstalledSkillInfo } from "./skill-accessor/contexts.js";

// Phase 3b accessor + context-builder helpers.
export { makeVftPackFileAccessor, type PackVFTNode } from "./pack-accessor/vft.js";
export {
  makePlatformPackFileAccessor,
  type PackAccessorPlatform,
} from "./pack-accessor/platform.js";
export { buildPackRuleContexts, type InstalledPackInfo } from "./pack-accessor/contexts.js";

// Phase 3c workspace read-model builder helpers.
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
/**
 * Concatenated rule-id array across every currently-exported catalog, in the
 * order catalogs were introduced (Phase 3a: `skillRules`; Phase 3b:
 * `packRules`; Phase 3c: `workspaceRules`).
 *
 * Used by the rule-id snapshot test; production callers should not depend on
 * this value.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const allCatalogRuleIds: ReadonlyArray<string> = [
  ...skillRules.map((r) => r.id),
  ...packRules.map((r) => r.id),
  ...subagentRules.map((r) => r.id),
  ...mcpServerRules.map((r) => r.id),
  ...hookRules.map((r) => r.id),
  ...ruleRules.map((r) => r.id),
  ...knowledgeRules.map((r) => r.id),
  ...workspaceRules.map((r) => r.id),
];

/** Error-severity rule identities that require an exhaustive recovery contract. */
export const allCatalogErrorRuleIds: ReadonlyArray<string> = [
  ...skillRules,
  ...packRules,
  ...subagentRules,
  ...mcpServerRules,
  ...hookRules,
  ...ruleRules,
  ...knowledgeRules,
  ...workspaceRules,
]
  .filter((rule) => rule.severity === "error")
  .map((rule) => rule.id);
