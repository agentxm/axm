/**
 * `rule/*` manifest envelope — see `../shared/envelope-rules.ts`.
 */

import { RuleManifestSchema, RULE_MANIFEST_FILENAME } from "../../../rules/manifest-schema.js";
import type { RuleRuleContext } from "../../context.js";
import { makeManifestEnvelopeRules } from "../shared/envelope-rules.js";

export const ruleEnvelopeRules = makeManifestEnvelopeRules({
  namespace: "rule",
  manifestFile: RULE_MANIFEST_FILENAME,
  schema: RuleManifestSchema,
  manifestJson: (context: RuleRuleContext) => context.subject.ruleJson,
  presentDescription: "Rules include a root rule.json manifest.",
  presentMissingMessage:
    "rule.json is missing. Create rule.json with the required manifest fields (`owner`, `type`, `name`, `version`).",
  schemaDescription: "rule.json defines a valid rule manifest.",
});
