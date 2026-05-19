import * as Effect from "effect/Effect";
import { ContextFilesManifestSchema } from "../../../context-files/manifest-schema.js";
import type { ContextFilesRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { enumerateUnknownTopLevelKeys, structFieldKeys } from "../shared/schema-rule.js";
import { CONTEXT_FILES_JSON } from "./helpers.js";

const RULE_ID = "context-files/manifest-keys-recognized";
const allowedKeys = structFieldKeys(ContextFilesManifestSchema);

export const manifestKeysRecognizedRule: AdvisoryRule<ContextFilesRuleContext> = {
  id: RULE_ID,
  description: "context-files.json uses only supported top-level fields.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.succeed(
      enumerateUnknownTopLevelKeys(
        RULE_ID,
        "error",
        CONTEXT_FILES_JSON,
        allowedKeys,
        context.subject.contextFilesJson,
      ),
    ),
};
