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
import { generatorValidRule as contextFilesGeneratorValidRule } from "./catalog/context-files/generator-valid.js";
import { manifestKeysRecognizedRule as contextFilesManifestKeysRecognizedRule } from "./catalog/context-files/manifest-keys-recognized.js";
import { manifestPresentRule as contextFilesManifestPresentRule } from "./catalog/context-files/manifest-present.js";
import { manifestSchemaValidRule as contextFilesManifestSchemaValidRule } from "./catalog/context-files/manifest-schema-valid.js";
import { markerValidRule as contextFilesMarkerValidRule } from "./catalog/context-files/marker-valid.js";
import { packageValidRule as contextFilesPackageValidRule } from "./catalog/context-files/package-valid.js";
import { targetValidRule as contextFilesTargetValidRule } from "./catalog/context-files/target-valid.js";
import { templateValidRule as contextFilesTemplateValidRule } from "./catalog/context-files/template-valid.js";
import { frontmatterParseableRule as skillFrontmatterParseableRule } from "./catalog/skill/frontmatter-parseable.js";
import { manifestKeysRecognizedRule as skillManifestKeysRecognizedRule } from "./catalog/skill/manifest-keys-recognized.js";
import { manifestPresentRule as skillManifestPresentRule } from "./catalog/skill/manifest-present.js";
import { manifestSchemaValidRule as skillManifestSchemaValidRule } from "./catalog/skill/manifest-schema-valid.js";
import { skillMdPresentRule } from "./catalog/skill/skill-md-present.js";
import type {
  CommandRuleContext,
  ContextFilesRuleContext,
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
  ContextFilesContent,
  ContextFilesAccessor,
  ContextFilesRuleContext,
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
export {
  makeVftContextFilesAccessor,
  type ContextFilesVFTNode,
} from "./catalog/context-files-accessor/vft.js";
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

export const contextFilesRules: ReadonlyArray<LintRule<ContextFilesRuleContext>> = [
  contextFilesManifestPresentRule,
  contextFilesManifestSchemaValidRule,
  contextFilesManifestKeysRecognizedRule,
  contextFilesPackageValidRule,
  contextFilesTargetValidRule,
  contextFilesTemplateValidRule,
  contextFilesGeneratorValidRule,
  contextFilesMarkerValidRule,
];
