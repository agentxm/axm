/**
 * `skill/*` manifest envelope — see `../shared/envelope-rules.ts`.
 *
 * `skill.json` sits at the package root, which for native skills is the
 * parent of the `src/` content root, so the envelope reads it through
 * `context.packageFiles`. Non-native (managed external) skills carry no
 * manifest; every envelope rule produces no findings for them.
 */

import { SkillManifestSchema } from "@agentxm/extension-model/unstable/skills/manifest-schema";
import type { SkillRuleContext } from "../../context.js";
import { makeManifestEnvelopeRules } from "../shared/envelope-rules.js";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";

export const skillEnvelopeRules = makeManifestEnvelopeRules({
  namespace: "skill",
  manifestFile: manifestFilenameForType("skill"),
  schema: SkillManifestSchema,
  manifestJson: (context: SkillRuleContext) => context.subject.skillJson,
  presentDescription: "Native skills include a root skill.json manifest.",
  presentMissingMessage:
    "This AXM skill package is missing its required skill.json manifest. Restore the package manifest before managing it.",
  schemaDescription: "skill.json defines a valid skill manifest.",
  getFiles: (context) => context.packageFiles,
  applies: (context) => context.subject.isNative,
});
