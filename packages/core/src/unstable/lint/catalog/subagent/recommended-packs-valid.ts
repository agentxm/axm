/**
 * `subagent/recommended-packs-valid` — recommended packs are bare FQNs, never
 * version-ranged specs. See `../shared/recommended-packs-rules.ts`.
 */

import type { SubagentRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { MANIFEST_FILENAME } from "../../../subagents/manifest-schema.js";
import { makeRecommendedPacksValidRule } from "../shared/recommended-packs-rules.js";

export const recommendedPacksValidRule: AdvisoryRule<SubagentRuleContext> =
  makeRecommendedPacksValidRule<SubagentRuleContext>({
    namespace: "subagent",
    manifestFile: MANIFEST_FILENAME,
    manifestJson: (context) => context.subject.subagentJson,
  });
