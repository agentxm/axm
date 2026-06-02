import * as Effect from "effect/Effect";
import { HookManifestSchema, HOOK_MANIFEST_FILENAME } from "../../../hooks/manifest-schema.js";
import type { HookRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { enumerateUnknownTopLevelKeys, structFieldKeys } from "../shared/schema-rule.js";

const RULE_ID = "hook/manifest-keys-recognized";

const allowedKeys = structFieldKeys(HookManifestSchema);

export const manifestKeysRecognizedRule: AdvisoryRule<HookRuleContext> = {
  id: RULE_ID,
  description: "hook.json uses only supported top-level fields.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.succeed(
      enumerateUnknownTopLevelKeys(
        RULE_ID,
        "error",
        HOOK_MANIFEST_FILENAME,
        allowedKeys,
        context.subject.hookJson,
      ),
    ),
};
