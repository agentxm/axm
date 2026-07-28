/**
 * `command/recommended-packs-valid` — recommended packs are bare FQNs, never
 * version-ranged specs. See `../shared/recommended-packs-rules.ts`.
 */

import type { CommandRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { COMMAND_MANIFEST_FILENAME } from "../../../commands/manifest-schema.js";
import { makeRecommendedPacksValidRule } from "../shared/recommended-packs-rules.js";

export const recommendedPacksValidRule: AdvisoryRule<CommandRuleContext> =
  makeRecommendedPacksValidRule<CommandRuleContext>({
    namespace: "command",
    manifestFile: COMMAND_MANIFEST_FILENAME,
    manifestJson: (context) => context.subject.commandJson,
  });
