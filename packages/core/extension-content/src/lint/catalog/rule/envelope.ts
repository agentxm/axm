/**
 * `rule/*` manifest envelope — see `../shared/envelope-rules.ts`.
 */

import { RuleManifestSchema } from "@agentxm/extension-model/unstable/rules/manifest-schema";
import type { RuleRuleContext } from "../../context.js";
import { makeManifestEnvelopeRules } from "../shared/envelope-rules.js";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";

export const ruleEnvelopeRules = makeManifestEnvelopeRules({
  namespace: "rule",
  manifestFile: manifestFilenameForType("rule"),
  schema: RuleManifestSchema,
  manifestJson: (context: RuleRuleContext) => context.subject.ruleJson,
  presentDescription: "Rules include a root rule.json manifest.",
  presentMissingMessage:
    "rule.json is missing. Create rule.json with the required manifest fields (`owner`, `type`, `name`, `version`).",
  schemaDescription: "rule.json defines a valid rule manifest.",
});
