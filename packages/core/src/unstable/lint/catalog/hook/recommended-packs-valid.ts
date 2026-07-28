/**
 * `hook/recommended-packs-valid` — recommended packs are bare FQNs, never
 * version-ranged specs. See `../shared/recommended-packs-rules.ts`.
 */

import type { HookRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { HOOK_MANIFEST_FILENAME } from "../../../hooks/manifest-schema.js";
import { makeRecommendedPacksValidRule } from "../shared/recommended-packs-rules.js";

export const recommendedPacksValidRule: AdvisoryRule<HookRuleContext> =
  makeRecommendedPacksValidRule<HookRuleContext>({
    namespace: "hook",
    manifestFile: HOOK_MANIFEST_FILENAME,
    manifestJson: (context) => context.subject.hookJson,
  });
