/**
 * `subagent/standalone-declaration-valid` — a manifest that opts out of standalone
 * use names the packs it needs. See `../shared/recommended-packs-rules.ts`.
 */

import type { SubagentRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { MANIFEST_FILENAME } from "../../../subagents/manifest-schema.js";
import { makeStandaloneDeclarationValidRule } from "../shared/recommended-packs-rules.js";

export const standaloneDeclarationValidRule: AdvisoryRule<SubagentRuleContext> =
  makeStandaloneDeclarationValidRule<SubagentRuleContext>({
    namespace: "subagent",
    manifestFile: MANIFEST_FILENAME,
    manifestJson: (context) => context.subject.subagentJson,
  });
