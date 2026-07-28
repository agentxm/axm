/**
 * `command/standalone-declaration-valid` — a manifest that opts out of standalone
 * use names the packs it needs. See `../shared/recommended-packs-rules.ts`.
 */

import type { CommandRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { COMMAND_MANIFEST_FILENAME } from "../../../commands/manifest-schema.js";
import { makeStandaloneDeclarationValidRule } from "../shared/recommended-packs-rules.js";

export const standaloneDeclarationValidRule: AdvisoryRule<CommandRuleContext> =
  makeStandaloneDeclarationValidRule<CommandRuleContext>({
    namespace: "command",
    manifestFile: COMMAND_MANIFEST_FILENAME,
    manifestJson: (context) => context.subject.commandJson,
  });
