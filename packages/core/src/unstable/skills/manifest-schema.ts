/**
 * Skill manifest schema definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import {
  CommonManifestBaseFields,
  ExtensionNameSchema,
  NonPackManifestFields,
} from "../extensions/common.js";

export const MANIFEST_FILENAME = "skill.json";

export const MANIFEST_SCHEMA_URL = "https://axm.sh/schemas/skill.schema.json";

/**
 * Schema for skill manifest files (skill.json).
 *
 * Skills extend coding agent capabilities with reusable prompts
 * and context that can be invoked on demand.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillManifestSchema = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  ...CommonManifestBaseFields,
  ...NonPackManifestFields,
  type: Schema.Literal("skill"),
  name: ExtensionNameSchema.pipe(
    Schema.annotateKey({ messageMissingKey: "skill name is required" }),
    Schema.annotate({
      description:
        "Short name for this skill within its owner namespace. Combined with owner, forms the FQN @owner/skills/<name>.",
    }),
  ),
}).annotate({
  identifier: "SkillManifest",
  title: "Skill Manifest",
  description:
    "Extension manifest file for skill. Carries the registry-facing identity, version, and metadata.",
});

/**
 * Inferred type for SkillManifest schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SkillManifest = Schema.Schema.Type<typeof SkillManifestSchema>;
