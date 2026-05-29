import { registerLintRuleIds } from "../config.js";
import type { DocsRuleContext } from "../context.js";
import type { LintRule } from "../rule.js";
import { generatorValidRule } from "./docs/generator-valid.js";
import { manifestKeysRecognizedRule } from "./docs/manifest-keys-recognized.js";
import { manifestPresentRule } from "./docs/manifest-present.js";
import { manifestSchemaValidRule } from "./docs/manifest-schema-valid.js";
import { markerValidRule } from "./docs/marker-valid.js";
import { packageValidRule } from "./docs/package-valid.js";
import { targetValidRule } from "./docs/target-valid.js";
import { templateValidRule } from "./docs/template-valid.js";

export const docsRules: ReadonlyArray<LintRule<DocsRuleContext>> = [
  manifestPresentRule,
  manifestSchemaValidRule,
  manifestKeysRecognizedRule,
  packageValidRule,
  targetValidRule,
  templateValidRule,
  generatorValidRule,
  markerValidRule,
];

registerLintRuleIds(docsRules.map((r) => r.id));
