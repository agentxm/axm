import { registerLintRuleIds } from "../config.js";
import type { ContextFilesRuleContext } from "../context.js";
import type { LintRule } from "../rule.js";
import { generatorValidRule } from "./context-files/generator-valid.js";
import { manifestKeysRecognizedRule } from "./context-files/manifest-keys-recognized.js";
import { manifestPresentRule } from "./context-files/manifest-present.js";
import { manifestSchemaValidRule } from "./context-files/manifest-schema-valid.js";
import { markerValidRule } from "./context-files/marker-valid.js";
import { packageValidRule } from "./context-files/package-valid.js";
import { targetValidRule } from "./context-files/target-valid.js";
import { templateValidRule } from "./context-files/template-valid.js";

export const contextFilesRules: ReadonlyArray<LintRule<ContextFilesRuleContext>> = [
  manifestPresentRule,
  manifestSchemaValidRule,
  manifestKeysRecognizedRule,
  packageValidRule,
  targetValidRule,
  templateValidRule,
  generatorValidRule,
  markerValidRule,
];

registerLintRuleIds(contextFilesRules.map((r) => r.id));
