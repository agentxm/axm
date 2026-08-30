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
import { subagentEnvelopeRules } from "./catalog/subagent/envelope.js";
import { mcpServerEnvelopeRules } from "./catalog/mcp-server/envelope.js";
import { hookEnvelopeRules } from "./catalog/hook/envelope.js";
import { ruleEnvelopeRules } from "./catalog/rule/envelope.js";
import { knowledgeEnvelopeRules } from "./catalog/knowledge/envelope.js";
import { orderedEnvelopeRules } from "./catalog/shared/envelope-rules.js";
import { entrypointExistsRule as hookEntrypointExistsRule } from "./catalog/hook/entrypoint-exists.js";
import { matcherRawPortabilityRule as hookMatcherRawPortabilityRule } from "./catalog/hook/matcher-raw-portability.js";
import { decisionPortabilityRule as hookDecisionPortabilityRule } from "./catalog/hook/decision-portability.js";
import { frontmatterParseableRule as skillFrontmatterParseableRule } from "./catalog/skill/frontmatter-parseable.js";
import { frontmatterStandardValidRule as skillFrontmatterStandardValidRule } from "./catalog/skill/frontmatter-standard-valid.js";
import { manifestKeysRecognizedRule as skillManifestKeysRecognizedRule } from "./catalog/skill/manifest-keys-recognized.js";
import { manifestPresentRule as skillManifestPresentRule } from "./catalog/skill/manifest-present.js";
import { manifestSchemaValidRule as skillManifestSchemaValidRule } from "./catalog/skill/manifest-schema-valid.js";
import { skillMdPresentRule } from "./catalog/skill/skill-md-present.js";
import { recommendedPacksValidRule as skillRecommendedPacksValidRule } from "./catalog/skill/recommended-packs-valid.js";
import { standaloneDeclarationValidRule as skillStandaloneDeclarationValidRule } from "./catalog/skill/standalone-declaration-valid.js";
import type {
  HookRuleContext,
  KnowledgeRuleContext,
  McpServerRuleContext,
  PackRuleContext,
  RuleRuleContext,
  SkillRuleContext,
  SubagentRuleContext,
} from "./context.js";
import type { LintRule } from "./rule.js";

export { composePath } from "./compose-path.js";
export { evaluateContexts, type Evaluated } from "./evaluate.js";
export type { LintConfig } from "./config.js";
export type {
  FileAccessError,
  HookContent,
  HookFileAccessor,
  HookRuleContext,
  KnowledgeContent,
  KnowledgeFileAccessor,
  KnowledgeRuleContext,
  RuleContent,
  RuleFileAccessor,
  RuleRuleContext,
  McpServerContent,
  McpServerFileAccessor,
  McpServerRuleContext,
  PackContent,
  PackFileAccessor,
  PackRuleContext,
  SkillContent,
  SkillFileAccessor,
  SkillRuleContext,
  SubagentContent,
  SubagentFileAccessor,
  SubagentRuleContext,
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
  skillFrontmatterStandardValidRule,
  skillManifestSchemaValidRule,
  skillManifestKeysRecognizedRule,
  skillStandaloneDeclarationValidRule,
  skillRecommendedPacksValidRule,
];

export const subagentRules: ReadonlyArray<LintRule<SubagentRuleContext>> =
  orderedEnvelopeRules(subagentEnvelopeRules);

export const mcpServerRules: ReadonlyArray<LintRule<McpServerRuleContext>> =
  orderedEnvelopeRules(mcpServerEnvelopeRules);

/**
 * Ordered publish-safe `hook//*` rule catalog.
 *
 * Identical to `catalog/hook.ts`: `hook/matcher-raw-portability` used to be
 * omitted here, which meant `axm publish` and `axm lint` disagreed about the
 * same `hook.json`. It is a pure-manifest advisory at `warning` severity, and
 * the publish gate fails only on `error` findings, so running it at publish
 * time surfaces the portability advice to the author without gating the
 * publish.
 */
export const hookRules: ReadonlyArray<LintRule<HookRuleContext>> = [
  hookEnvelopeRules.manifestPresent,
  hookEnvelopeRules.manifestSchemaValid,
  hookEnvelopeRules.manifestKeysRecognized,
  hookDecisionPortabilityRule,
  hookMatcherRawPortabilityRule,
  hookEntrypointExistsRule,
  hookEnvelopeRules.standaloneDeclarationValid,
  hookEnvelopeRules.recommendedPacksValid,
];

export const ruleRules: ReadonlyArray<LintRule<RuleRuleContext>> =
  orderedEnvelopeRules(ruleEnvelopeRules);

export const knowledgeRules: ReadonlyArray<LintRule<KnowledgeRuleContext>> =
  orderedEnvelopeRules(knowledgeEnvelopeRules);
