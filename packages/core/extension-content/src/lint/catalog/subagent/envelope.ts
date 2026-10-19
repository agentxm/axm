/**
 * `subagent/*` manifest envelope — see `../shared/envelope-rules.ts`.
 */

import { SubagentManifestSchema } from "@agentxm/extension-model/unstable/subagents/manifest-schema";
import type { SubagentRuleContext } from "../../context.js";
import { makeManifestEnvelopeRules } from "../shared/envelope-rules.js";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";

export const subagentEnvelopeRules = makeManifestEnvelopeRules({
  namespace: "subagent",
  manifestFile: manifestFilenameForType("subagent"),
  schema: SubagentManifestSchema,
  manifestJson: (context: SubagentRuleContext) => context.subject.subagentJson,
  presentDescription: "Subagents include a root subagent.json manifest.",
  presentMissingMessage:
    "subagent.json is missing. Create the identity fields and either a described portable core or explicit native implementations.",
  schemaDescription: "subagent.json defines a valid subagent manifest.",
});
