import * as Effect from "effect/Effect";
import type { CommandRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { CommandManifestSchema } from "../../../commands/manifest-schema.js";
import { enumerateUnknownTopLevelKeys, structFieldKeys } from "../shared/schema-rule.js";

const RULE_ID = "command/manifest-keys-recognized";
const COMMAND_JSON = "command.json";

const allowedKeys = structFieldKeys(CommandManifestSchema);

export const manifestKeysRecognizedRule: AdvisoryRule<CommandRuleContext> = {
  id: RULE_ID,
  description: "command.json uses only supported top-level fields.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.succeed(
      enumerateUnknownTopLevelKeys(
        RULE_ID,
        "error",
        COMMAND_JSON,
        allowedKeys,
        context.subject.commandJson,
      ),
    ),
};
