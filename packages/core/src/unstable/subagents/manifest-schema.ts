/**
 * Subagent manifest schema definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { CommonManifestBaseFields, ExtensionNameSchema } from "../extensions/common.js";
import { ToolAccessLevelSchema } from "./tool-access.js";

/**
 * Filename for subagent manifest files.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const MANIFEST_FILENAME = "subagent.json";

/**
 * URL for the subagent manifest JSON Schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const MANIFEST_SCHEMA_URL = "https://axm.sh/schemas/subagent.schema.json";

/**
 * Schema for subagent manifest files (subagent.json).
 *
 * Subagents are autonomous agent instances that can be delegated work
 * by a parent agent, each with their own instructions, model preferences,
 * and tool access controls.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SubagentManifestSchema = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  ...CommonManifestBaseFields,
  type: Schema.Literal("subagent"),
  name: ExtensionNameSchema.pipe(
    Schema.annotateKey({ messageMissingKey: "subagent name is required" }),
  ),
  model: Schema.optional(Schema.String),
  toolAccess: Schema.optional(ToolAccessLevelSchema),
  background: Schema.optional(
    Schema.Boolean.pipe(Schema.withConstructorDefault(() => Option.some(false))),
  ),
  agents: Schema.optional(Schema.Array(Schema.String)),
}).annotate({
  identifier: "SubagentManifest",
  title: "Subagent Manifest",
  description:
    "Configuration file (subagent.json) that defines a subagent — an autonomous agent instance with its own instructions, model, and tool access.",
});

/**
 * Inferred type for SubagentManifest schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SubagentManifest = Schema.Schema.Type<typeof SubagentManifestSchema>;
