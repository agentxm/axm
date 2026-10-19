/**
 * `knowledge/*` manifest envelope — see `../shared/envelope-rules.ts`.
 */

import { KnowledgeManifestSchema } from "@agentxm/extension-model/unstable/knowledge/manifest-schema";
import type { KnowledgeRuleContext } from "../../context.js";
import { makeManifestEnvelopeRules } from "../shared/envelope-rules.js";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";

export const knowledgeEnvelopeRules = makeManifestEnvelopeRules({
  namespace: "knowledge",
  manifestFile: manifestFilenameForType("knowledge"),
  schema: KnowledgeManifestSchema,
  manifestJson: (context: KnowledgeRuleContext) => context.subject.knowledgeJson,
  presentDescription: "Knowledge bundles include a root knowledge.json manifest.",
  presentMissingMessage:
    "knowledge.json is missing. Create knowledge.json with the required manifest fields (`owner`, `type`, `name`, `version`, `format`, `bundleRoot`).",
  schemaDescription: "knowledge.json defines a valid knowledge manifest.",
});
