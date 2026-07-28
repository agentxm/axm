/**
 * `hook/standalone-declaration-valid` — a manifest that opts out of standalone
 * use names the packs it needs. See `../shared/recommended-packs-rules.ts`.
 */

import type { HookRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { HOOK_MANIFEST_FILENAME } from "../../../hooks/manifest-schema.js";
import { makeStandaloneDeclarationValidRule } from "../shared/recommended-packs-rules.js";

export const standaloneDeclarationValidRule: AdvisoryRule<HookRuleContext> =
  makeStandaloneDeclarationValidRule<HookRuleContext>({
    namespace: "hook",
    manifestFile: HOOK_MANIFEST_FILENAME,
    manifestJson: (context) => context.subject.hookJson,
  });
