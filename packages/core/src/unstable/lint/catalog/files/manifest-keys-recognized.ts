import * as Effect from "effect/Effect";
import { FilesManifestSchema } from "../../../files/manifest-schema.js";
import type { FilesRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { enumerateUnknownTopLevelKeys, structFieldKeys } from "../shared/schema-rule.js";
import { FILES_JSON } from "./helpers.js";

const RULE_ID = "files/manifest-keys-recognized";
const allowedKeys = structFieldKeys(FilesManifestSchema);

export const manifestKeysRecognizedRule: AdvisoryRule<FilesRuleContext> = {
  id: RULE_ID,
  description: "files.json uses only supported top-level fields.",
  kind: "advisory",
  severity: "error",
  check: (files) =>
    Effect.succeed(
      enumerateUnknownTopLevelKeys(
        RULE_ID,
        "error",
        FILES_JSON,
        allowedKeys,
        files.subject.filesJson,
      ),
    ),
};
