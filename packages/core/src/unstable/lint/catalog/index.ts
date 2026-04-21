/**
 * Catalog barrel — aggregates the per-namespace rule catalogs for consumers
 * that want the full v1 rule set.
 *
 * Phase 3a lands `skillRules` from this barrel. Phases 3b and 3c will append
 * `packRules` and `workspaceRules` without touching existing imports.
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

export { skillRules } from "./skill.js";

// Phase 3a accessor + context-builder helpers. Phase 3b and 3c will export
// their analogs next to these.
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

/**
 * Concatenated rule-id array across every currently-exported catalog, in the
 * order catalogs were introduced (Phase 3a: `skillRules`; Phase 3b will
 * append `packRules`; Phase 3c will append `workspaceRules`).
 *
 * Used by the rule-id snapshot test; production callers should not depend on
 * this value.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const allCatalogRuleIds: ReadonlyArray<string> = [...skillRules.map((r) => r.id)];
