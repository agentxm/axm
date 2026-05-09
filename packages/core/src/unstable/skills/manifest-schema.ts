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
  description: Schema.optional(
    Schema.String.pipe(
      Schema.annotate({
        description:
          "Optional, registry-only description shown in listings. This is separate from the SKILL.md frontmatter `description`, which is the trigger phrase the agent uses to decide when to invoke the skill.",
      }),
    ),
  ),
  type: Schema.Literal("skill"),
  name: ExtensionNameSchema.pipe(
    Schema.annotateKey({ messageMissingKey: "skill name is required" }),
  ),
}).annotate({
  identifier: "SkillManifest",
  title: "Skill Manifest",
  description:
    "Configuration file (skill.json) that defines a skill — reusable prompts and context for coding agents.",
});

/**
 * Inferred type for SkillManifest schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SkillManifest = Schema.Schema.Type<typeof SkillManifestSchema>;
