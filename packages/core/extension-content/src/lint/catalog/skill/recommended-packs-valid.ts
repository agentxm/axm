/**
 * `skill/recommended-packs-valid` — recommended packs are bare FQNs, never
 * version-ranged specs. See `../shared/recommended-packs-rules.ts`.
 */

import type { SkillRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { makeRecommendedPacksValidRule } from "../shared/recommended-packs-rules.js";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";

export const recommendedPacksValidRule: AdvisoryRule<SkillRuleContext> =
  makeRecommendedPacksValidRule<SkillRuleContext>({
    namespace: "skill",
    manifestFile: manifestFilenameForType("skill"),
    manifestJson: (context) => context.subject.skillJson,
  });
