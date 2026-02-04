/**
 * Skill manifest schema definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { CommonManifestFields } from "./common";

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
});

/**
 * Inferred type for SkillManifest schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SkillManifest = typeof SkillManifestSchema.Type;
