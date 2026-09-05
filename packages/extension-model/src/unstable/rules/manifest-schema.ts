/**
 * Rule manifest schema definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import {
  CommonManifestBaseFields,
  ExtensionNameSchema,
  NonPackManifestFields,
} from "../extensions/common.js";

export const RULE_MANIFEST_FILENAME = "rule.json";

export const RULE_EXTENSION_DIR = "rules";

export const RULE_MANIFEST_SCHEMA_URL = "https://axm.sh/schemas/rule.schema.json";

export const RULE_BODY_FILENAME = "RULE.md";

/**
 * Schema for rule manifest files (rule.json).
 *
 * Rules distribute behavior guidance. Placement is workspace-owned; v1 injects
 * enabled rule bodies into the canonical instruction source file.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const RuleManifestSchema = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  ...CommonManifestBaseFields,
  ...NonPackManifestFields,
  type: Schema.Literal("rule"),
  name: ExtensionNameSchema.pipe(
    Schema.annotateKey({ messageMissingKey: "rule name is required" }),
    Schema.annotate({
      description:
        "Short name for this rule within its owner namespace. Combined with owner, forms the FQN @owner/rules/<name>.",
    }),
  ),
  title: Schema.optional(
    Schema.NonEmptyString.annotate({
      description: "Optional display title for this rule.",
    }),
  ),
  priority: Schema.optional(
    Schema.Int.annotate({
      description: "Ordering priority for instruction injection. Lower values render earlier.",
      default: 100,
    }),
  ),
  appliesTo: Schema.optional(
    Schema.Array(Schema.NonEmptyString).annotate({
      description:
        "Advisory path globs for future scoped placement. v1 inject placement does not enforce globs.",
    }),
  ),
}).annotate({
  identifier: "RuleManifest",
  title: "Rule Manifest",
  description:
    "Rule manifest for behavior-guidance extensions. The rule body lives at src/RULE.md.",
});

/** @experimental */
export type RuleManifest = Schema.Schema.Type<typeof RuleManifestSchema>;
