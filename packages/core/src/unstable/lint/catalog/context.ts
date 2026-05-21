import { registerLintRuleIds } from "../config.js";
import type { ContextRuleContext } from "../context.js";
import type { LintRule } from "../rule.js";
import { generatorValidRule } from "./context/generator-valid.js";
import { manifestKeysRecognizedRule } from "./context/manifest-keys-recognized.js";
import { manifestPresentRule } from "./context/manifest-present.js";
import { manifestSchemaValidRule } from "./context/manifest-schema-valid.js";
import { markerValidRule } from "./context/marker-valid.js";
import { packageValidRule } from "./context/package-valid.js";
import { targetValidRule } from "./context/target-valid.js";
import { templateValidRule } from "./context/template-valid.js";

export const contextRules: ReadonlyArray<LintRule<ContextRuleContext>> = [
  manifestPresentRule,
  manifestSchemaValidRule,
  manifestKeysRecognizedRule,
  packageValidRule,
  targetValidRule,
  templateValidRule,
  generatorValidRule,
  markerValidRule,
];

registerLintRuleIds(contextRules.map((r) => r.id));
