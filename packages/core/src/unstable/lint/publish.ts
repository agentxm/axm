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
import { manifestKeysRecognizedRule as commandManifestKeysRecognizedRule } from "./catalog/command/manifest-keys-recognized.js";
import { manifestPresentRule as commandManifestPresentRule } from "./catalog/command/manifest-present.js";
import { manifestSchemaValidRule as commandManifestSchemaValidRule } from "./catalog/command/manifest-schema-valid.js";
import { manifestKeysRecognizedRule as subagentManifestKeysRecognizedRule } from "./catalog/subagent/manifest-keys-recognized.js";
import { manifestPresentRule as subagentManifestPresentRule } from "./catalog/subagent/manifest-present.js";
import { manifestSchemaValidRule as subagentManifestSchemaValidRule } from "./catalog/subagent/manifest-schema-valid.js";
import { manifestKeysRecognizedRule as mcpServerManifestKeysRecognizedRule } from "./catalog/mcp-server/manifest-keys-recognized.js";
import { manifestPresentRule as mcpServerManifestPresentRule } from "./catalog/mcp-server/manifest-present.js";
import { manifestSchemaValidRule as mcpServerManifestSchemaValidRule } from "./catalog/mcp-server/manifest-schema-valid.js";
import { generatorValidRule as contextGeneratorValidRule } from "./catalog/context/generator-valid.js";
import { manifestKeysRecognizedRule as contextManifestKeysRecognizedRule } from "./catalog/context/manifest-keys-recognized.js";
import { manifestPresentRule as contextManifestPresentRule } from "./catalog/context/manifest-present.js";
import { manifestSchemaValidRule as contextManifestSchemaValidRule } from "./catalog/context/manifest-schema-valid.js";
import { markerValidRule as contextMarkerValidRule } from "./catalog/context/marker-valid.js";
import { packageValidRule as contextPackageValidRule } from "./catalog/context/package-valid.js";
import { targetValidRule as contextTargetValidRule } from "./catalog/context/target-valid.js";
import { templateValidRule as contextTemplateValidRule } from "./catalog/context/template-valid.js";
import { frontmatterParseableRule as skillFrontmatterParseableRule } from "./catalog/skill/frontmatter-parseable.js";
import { manifestKeysRecognizedRule as skillManifestKeysRecognizedRule } from "./catalog/skill/manifest-keys-recognized.js";
import { manifestPresentRule as skillManifestPresentRule } from "./catalog/skill/manifest-present.js";
import { manifestSchemaValidRule as skillManifestSchemaValidRule } from "./catalog/skill/manifest-schema-valid.js";
import { skillMdPresentRule } from "./catalog/skill/skill-md-present.js";
import type {
  CommandRuleContext,
  ContextRuleContext,
  McpServerRuleContext,
  PackRuleContext,
  SkillRuleContext,
  SubagentRuleContext,
} from "./context.js";
import type { LintRule } from "./rule.js";

export { composePath } from "./compose-path.js";
export { evaluateContexts, type Evaluated } from "./evaluate.js";
export type { LintConfig } from "./config.js";
export type {
  FileAccessError,
  CommandContent,
  CommandFileAccessor,
  CommandRuleContext,
  ContextContent,
  ContextAccessor,
  ContextRuleContext,
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
export { makeVftContextAccessor, type ContextVFTNode } from "./catalog/context-accessor/vft.js";
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

export const commandRules: ReadonlyArray<LintRule<CommandRuleContext>> = [
  commandManifestPresentRule,
  commandManifestSchemaValidRule,
  commandManifestKeysRecognizedRule,
];

export const subagentRules: ReadonlyArray<LintRule<SubagentRuleContext>> = [
  subagentManifestPresentRule,
  subagentManifestSchemaValidRule,
  subagentManifestKeysRecognizedRule,
];

export const mcpServerRules: ReadonlyArray<LintRule<McpServerRuleContext>> = [
  mcpServerManifestPresentRule,
  mcpServerManifestSchemaValidRule,
  mcpServerManifestKeysRecognizedRule,
];

export const contextRules: ReadonlyArray<LintRule<ContextRuleContext>> = [
  contextManifestPresentRule,
  contextManifestSchemaValidRule,
  contextManifestKeysRecognizedRule,
  contextPackageValidRule,
  contextTargetValidRule,
  contextTemplateValidRule,
  contextGeneratorValidRule,
  contextMarkerValidRule,
];
