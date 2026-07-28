import { registerLintRuleIds } from "../config.js";
import type { FilesRuleContext } from "../context.js";
import type { LintRule } from "../rule.js";
import { generatorValidRule } from "./files/generator-valid.js";
import { manifestKeysRecognizedRule } from "./files/manifest-keys-recognized.js";
import { manifestPresentRule } from "./files/manifest-present.js";
import { manifestSchemaValidRule } from "./files/manifest-schema-valid.js";
import { markerValidRule } from "./files/marker-valid.js";
import { packageValidRule } from "./files/package-valid.js";
import { targetValidRule } from "./files/target-valid.js";
import { templateValidRule } from "./files/template-valid.js";
import { recommendedPacksValidRule } from "./files/recommended-packs-valid.js";
import { standaloneDeclarationValidRule } from "./files/standalone-declaration-valid.js";

export const filesRules: ReadonlyArray<LintRule<FilesRuleContext>> = [
  manifestPresentRule,
  manifestSchemaValidRule,
  manifestKeysRecognizedRule,
  packageValidRule,
  targetValidRule,
  templateValidRule,
  generatorValidRule,
  markerValidRule,
  standaloneDeclarationValidRule,
  recommendedPacksValidRule,
];

registerLintRuleIds(filesRules.map((r) => r.id));
