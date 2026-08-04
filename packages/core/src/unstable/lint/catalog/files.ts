import { registerLintRuleIds } from "../config.js";
import type { FilesRuleContext } from "../context.js";
import type { LintRule } from "../rule.js";
import { filesEnvelopeRules } from "./files/envelope.js";
import { generatorValidRule } from "./files/generator-valid.js";
import { markerValidRule } from "./files/marker-valid.js";
import { packageValidRule } from "./files/package-valid.js";
import { targetValidRule } from "./files/target-valid.js";
import { templateValidRule } from "./files/template-valid.js";

export const filesRules: ReadonlyArray<LintRule<FilesRuleContext>> = [
  filesEnvelopeRules.manifestPresent,
  filesEnvelopeRules.manifestSchemaValid,
  filesEnvelopeRules.manifestKeysRecognized,
  packageValidRule,
  targetValidRule,
  templateValidRule,
  generatorValidRule,
  markerValidRule,
  filesEnvelopeRules.standaloneDeclarationValid,
  filesEnvelopeRules.recommendedPacksValid,
];

registerLintRuleIds(filesRules.map((r) => r.id));
