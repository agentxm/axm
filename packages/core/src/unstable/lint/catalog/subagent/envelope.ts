/**
 * `subagent/*` manifest envelope — see `../shared/envelope-rules.ts`.
 */

import { MANIFEST_FILENAME, SubagentManifestSchema } from "../../../subagents/manifest-schema.js";
import type { SubagentRuleContext } from "../../context.js";
import { makeManifestEnvelopeRules } from "../shared/envelope-rules.js";

export const subagentEnvelopeRules = makeManifestEnvelopeRules({
  namespace: "subagent",
  manifestFile: MANIFEST_FILENAME,
  schema: SubagentManifestSchema,
  manifestJson: (context: SubagentRuleContext) => context.subject.subagentJson,
  presentDescription: "Subagents include a root subagent.json manifest.",
  presentMissingMessage:
    "subagent.json is missing. Create subagent.json with the required manifest fields (`owner`, `type`, `name`, `version`).",
  schemaDescription: "subagent.json defines a valid subagent manifest.",
});
