/**
 * Skill manifest schema definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { CommonManifestBaseFields, ExtensionNameSchema } from "../extensions/common.js";

export const MANIFEST_FILENAME = "axm-skill.json";

/**
 * Schema for skill manifest files (axm-skill.json).
 *
 * Skills extend coding agent capabilities with reusable prompts
 * and context that can be invoked on demand.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillManifestSchema = Schema.Struct({
  ...CommonManifestBaseFields,
  type: Schema.Literal("skill"),
  name: ExtensionNameSchema,
  agents: Schema.optional(Schema.Array(Schema.String)),
});

/**
 * Inferred type for SkillManifest schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SkillManifest = Schema.Schema.Type<typeof SkillManifestSchema>;
