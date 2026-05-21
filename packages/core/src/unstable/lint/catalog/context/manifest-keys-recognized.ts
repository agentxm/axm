import * as Effect from "effect/Effect";
import { ContextManifestSchema } from "../../../context/manifest-schema.js";
import type { ContextRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { enumerateUnknownTopLevelKeys, structFieldKeys } from "../shared/schema-rule.js";
import { CONTEXT_JSON } from "./helpers.js";

const RULE_ID = "context/manifest-keys-recognized";
const allowedKeys = structFieldKeys(ContextManifestSchema);

export const manifestKeysRecognizedRule: AdvisoryRule<ContextRuleContext> = {
  id: RULE_ID,
  description: "context.json uses only supported top-level fields.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.succeed(
      enumerateUnknownTopLevelKeys(
        RULE_ID,
        "error",
        CONTEXT_JSON,
        allowedKeys,
        context.subject.contextJson,
      ),
    ),
};
