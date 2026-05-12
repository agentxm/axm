/**
 * Registry-publish lint surface.
 *
 * This entry point intentionally exports only the primitives the registry
 * publish gate needs. It avoids the full lint barrel because that surface also
 * constructs workspace-settings schemas and workspace catalogs for `axm lint`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { manifestKeysRecognizedRule as packManifestKeysRecognizedRule } from "./catalog/pack/manifest-keys-recognized.js";
import { manifestPresentRule as packManifestPresentRule } from "./catalog/pack/manifest-present.js";
import { manifestSchemaValidRule as packManifestSchemaValidRule } from "./catalog/pack/manifest-schema-valid.js";
import { frontmatterParseableRule as skillFrontmatterParseableRule } from "./catalog/skill/frontmatter-parseable.js";
import { manifestKeysRecognizedRule as skillManifestKeysRecognizedRule } from "./catalog/skill/manifest-keys-recognized.js";
import { manifestPresentRule as skillManifestPresentRule } from "./catalog/skill/manifest-present.js";
import { manifestSchemaValidRule as skillManifestSchemaValidRule } from "./catalog/skill/manifest-schema-valid.js";
import { skillMdPresentRule } from "./catalog/skill/skill-md-present.js";
import type { PackRuleContext, SkillRuleContext } from "./context.js";
import type { LintRule } from "./rule.js";

export { composePath } from "./compose-path.js";
export { evaluateContexts, type Evaluated } from "./evaluate.js";
export type { LintConfig } from "./config.js";
export type {
  FileAccessError,
  PackContent,
  PackFileAccessor,
  PackRuleContext,
  SkillContent,
  SkillFileAccessor,
  SkillRuleContext,
} from "./context.js";
export type { LintFinding, LintRule } from "./rule.js";
export { makeVftPackFileAccessor, type PackVFTNode } from "./catalog/pack-accessor/vft.js";
export {
  makeVftSkillFileAccessor,
  makeVftSkillFileAccessorScoped,
  type VFTNode,
} from "./catalog/skill-accessor/vft.js";

/**
 * Ordered publish-safe `pack/*` rule catalog.
 *
 * This intentionally avoids `./catalog/pack.js`, whose module-load rule-id
 * registration imports the workspace lint config schema.
 */
export const packRules: ReadonlyArray<LintRule<PackRuleContext>> = [
  packManifestPresentRule,
  packManifestSchemaValidRule,
  packManifestKeysRecognizedRule,
];

/**
 * Ordered publish-safe `skill/*` rule catalog.
 *
 * This intentionally avoids `./catalog/skill.js`, whose module-load rule-id
 * registration imports the workspace lint config schema.
 */
export const skillRules: ReadonlyArray<LintRule<SkillRuleContext>> = [
  skillMdPresentRule,
  skillManifestPresentRule,
  skillFrontmatterParseableRule,
  skillManifestSchemaValidRule,
  skillManifestKeysRecognizedRule,
];
