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
import { workspaceRules } from "./workspace.js";

export { skillRules } from "./skill.js";
export { packRules } from "./pack.js";
export { workspaceRules } from "./workspace.js";

// Phase 3a accessor + context-builder helpers.
export { makeVftSkillFileAccessor, type VFTNode } from "./skill-accessor/vft.js";
export {
  makePlatformSkillFileAccessor,
  type SkillAccessorPlatform,
} from "./skill-accessor/platform.js";
export {
  buildSkillRuleContexts,
  type InstalledSkillInfo,
  type SkillIndexView,
} from "./skill-accessor/contexts.js";

// Phase 3b accessor + context-builder helpers.
export { makeVftPackFileAccessor, type PackVFTNode } from "./pack-accessor/vft.js";
export {
  makePlatformPackFileAccessor,
  type PackAccessorPlatform,
} from "./pack-accessor/platform.js";
export {
  buildPackRuleContexts,
  type InstalledPackInfo,
  type PackIndexView,
} from "./pack-accessor/contexts.js";

// Phase 3c accessor + context-builder helpers.
export {
  makePlatformWorkspaceLintAccessor,
  type PlatformWorkspaceLintAccessorArgs,
  type WorkspaceAccessorPlatform,
  type WorkspaceIndexView,
} from "./workspace-accessor/platform.js";
export {
  buildWorkspaceRuleContext,
  buildNativeInstalledSkillInfo,
  buildExternalInstalledSkillInfo,
  buildInstalledPackInfo,
  externalSkillDisplayRoot,
  registryNativeSkillDisplayRoot,
  registryPackDisplayRoot,
  type BuildInstalledPackInfoArgs,
  type BuildInstalledSkillInfoExternalArgs,
  type BuildInstalledSkillInfoNativeArgs,
  type BuildWorkspaceRuleContextArgs,
  type WorkspaceIndex,
} from "./workspace-accessor/contexts.js";
export {
  PER_EXTENSION_OPERATION_NAMES,
  isPerExtensionOperationName,
  type PerExtensionOperationName,
} from "./workspace/helpers/install-ops.js";

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
  ...workspaceRules.map((r) => r.id),
];
