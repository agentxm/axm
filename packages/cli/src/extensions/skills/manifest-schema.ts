/**
 * Skill manifest schema definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { CommonManifestFields } from "../common.js";

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
  ...CommonManifestFields,
  agents: Schema.optional(Schema.Array(Schema.String)),
  dependencies: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
});

/**
 * Inferred type for SkillManifest schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SkillManifest = typeof SkillManifestSchema.Type;
