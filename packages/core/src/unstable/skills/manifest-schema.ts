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
  $schema: Schema.optional(
    Schema.String.annotate({
      description:
        "JSON Schema URL used by editors for validation and completions. Typically set automatically by axm.",
    }),
  ),
  ...CommonManifestBaseFields,
  ...NonPackManifestFields,
  description: Schema.optional(
    Schema.String.pipe(
      Schema.annotate({
        description:
          "Registry-facing summary shown in listings. Distinct from the SKILL.md frontmatter `description`, which is the trigger phrase the agent uses to decide when to invoke the skill.",
      }),
    ),
  ),
  type: Schema.Literal("skill").annotate({
    description: "Discriminator for the manifest kind. Always 'skill' for skill.json.",
  }),
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
    "Skill extension manifest (skill.json). The prompt body and trigger phrase live in SKILL.md alongside this file; this manifest carries the registry-facing identity, version, and metadata.",
});

/**
 * Inferred type for SkillManifest schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SkillManifest = Schema.Schema.Type<typeof SkillManifestSchema>;
