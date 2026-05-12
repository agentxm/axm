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
export { packRules } from "./catalog/pack.js";
export { skillRules } from "./catalog/skill.js";
export {
  makeVftPackFileAccessor,
  type PackVFTNode,
} from "./catalog/pack-accessor/vft.js";
export {
  makeVftSkillFileAccessor,
  makeVftSkillFileAccessorScoped,
  type VFTNode,
} from "./catalog/skill-accessor/vft.js";
