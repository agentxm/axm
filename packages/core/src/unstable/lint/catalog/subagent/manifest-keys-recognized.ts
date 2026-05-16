import * as Effect from "effect/Effect";
import type { SubagentRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { SubagentManifestSchema } from "../../../subagents/manifest-schema.js";
import { enumerateUnknownTopLevelKeys, structFieldKeys } from "../shared/schema-rule.js";

const RULE_ID = "subagent/manifest-keys-recognized";
const SUBAGENT_JSON = "subagent.json";

const allowedKeys = structFieldKeys(SubagentManifestSchema);

export const manifestKeysRecognizedRule: AdvisoryRule<SubagentRuleContext> = {
  id: RULE_ID,
  description: "subagent.json uses only supported top-level fields.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.succeed(
      enumerateUnknownTopLevelKeys(
        RULE_ID,
        "error",
        SUBAGENT_JSON,
        allowedKeys,
        context.subject.subagentJson,
      ),
    ),
};
