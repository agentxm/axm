/**
 * `skill/recommended-packs-valid` — recommended packs are bare FQNs, never
 * version-ranged specs. See `../shared/recommended-packs-rules.ts`.
 */

import type { SkillRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { MANIFEST_FILENAME } from "../../../skills/manifest-schema.js";
import { makeRecommendedPacksValidRule } from "../shared/recommended-packs-rules.js";

export const recommendedPacksValidRule: AdvisoryRule<SkillRuleContext> =
  makeRecommendedPacksValidRule<SkillRuleContext>({
    namespace: "skill",
    manifestFile: MANIFEST_FILENAME,
    manifestJson: (context) => context.subject.skillJson,
  });
