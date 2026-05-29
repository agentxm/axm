import * as Effect from "effect/Effect";
import { DocsManifestSchema } from "../../../docs/manifest-schema.js";
import type { DocsRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { enumerateUnknownTopLevelKeys, structFieldKeys } from "../shared/schema-rule.js";
import { DOCS_JSON } from "./helpers.js";

const RULE_ID = "docs/manifest-keys-recognized";
const allowedKeys = structFieldKeys(DocsManifestSchema);

export const manifestKeysRecognizedRule: AdvisoryRule<DocsRuleContext> = {
  id: RULE_ID,
  description: "docs.json uses only supported top-level fields.",
  kind: "advisory",
  severity: "error",
  check: (docs) =>
    Effect.succeed(
      enumerateUnknownTopLevelKeys(RULE_ID, "error", DOCS_JSON, allowedKeys, docs.subject.docsJson),
    ),
};
