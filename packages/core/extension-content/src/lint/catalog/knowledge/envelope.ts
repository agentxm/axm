/**
 * `knowledge/*` manifest envelope — see `../shared/envelope-rules.ts`.
 */

import {
  KnowledgeManifestSchema,
  KNOWLEDGE_MANIFEST_FILENAME,
} from "@agentxm/extension-model/unstable/knowledge/manifest-schema";
import type { KnowledgeRuleContext } from "../../context.js";
import { makeManifestEnvelopeRules } from "../shared/envelope-rules.js";

export const knowledgeEnvelopeRules = makeManifestEnvelopeRules({
  namespace: "knowledge",
  manifestFile: KNOWLEDGE_MANIFEST_FILENAME,
  schema: KnowledgeManifestSchema,
  manifestJson: (context: KnowledgeRuleContext) => context.subject.knowledgeJson,
  presentDescription: "Knowledge bundles include a root knowledge.json manifest.",
  presentMissingMessage:
    "knowledge.json is missing. Create knowledge.json with the required manifest fields (`owner`, `type`, `name`, `version`, `format`, `bundleRoot`).",
  schemaDescription: "knowledge.json defines a valid knowledge manifest.",
});
