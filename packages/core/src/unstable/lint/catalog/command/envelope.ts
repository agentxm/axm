/**
 * `command/*` manifest envelope — see `../shared/envelope-rules.ts`.
 */

import {
  CommandManifestSchema,
  COMMAND_MANIFEST_FILENAME,
} from "../../../commands/manifest-schema.js";
import type { CommandRuleContext } from "../../context.js";
import { makeManifestEnvelopeRules } from "../shared/envelope-rules.js";

export const commandEnvelopeRules = makeManifestEnvelopeRules({
  namespace: "command",
  manifestFile: COMMAND_MANIFEST_FILENAME,
  schema: CommandManifestSchema,
  manifestJson: (context: CommandRuleContext) => context.subject.commandJson,
  presentDescription: "Commands include a root command.json manifest.",
  presentMissingMessage:
    "command.json is missing. Create command.json with the required manifest fields (`owner`, `type`, `name`, `version`).",
  schemaDescription: "command.json defines a valid command manifest.",
});
