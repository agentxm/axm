/**
 * `skill/standalone-declaration-valid` — a manifest that opts out of standalone
 * use names the packs it needs. See `../shared/recommended-packs-rules.ts`.
 */

import type { SkillRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { MANIFEST_FILENAME } from "@agentxm/extension-model/unstable/skills/manifest-schema";
import { makeStandaloneDeclarationValidRule } from "../shared/recommended-packs-rules.js";

export const standaloneDeclarationValidRule: AdvisoryRule<SkillRuleContext> =
  makeStandaloneDeclarationValidRule<SkillRuleContext>({
    namespace: "skill",
    manifestFile: MANIFEST_FILENAME,
    manifestJson: (context) => context.subject.skillJson,
  });
