/**
 * `skill/standalone-declaration-valid` — a manifest that opts out of standalone
 * use names the packs it needs. See `../shared/recommended-packs-rules.ts`.
 */

import type { SkillRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { makeStandaloneDeclarationValidRule } from "../shared/recommended-packs-rules.js";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";

export const standaloneDeclarationValidRule: AdvisoryRule<SkillRuleContext> =
  makeStandaloneDeclarationValidRule<SkillRuleContext>({
    namespace: "skill",
    manifestFile: manifestFilenameForType("skill"),
    manifestJson: (context) => context.subject.skillJson,
  });
