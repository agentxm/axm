/**
 * Subagent manifest schema definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import {
  CommonManifestBaseFields,
  ExtensionNameSchema,
  NonPackManifestFields,
} from "../extensions/common.js";

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
 * The manifest carries registry-facing identity and metadata. Fields like
 * `model`, `toolAccess`, and `background` live (if at all) in the content
 * file's frontmatter and are passed through to agent-native files verbatim;
 * the manifest does not mirror them.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SubagentManifestSchema = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  ...CommonManifestBaseFields,
  ...NonPackManifestFields,
  type: Schema.Literal("subagent"),
  name: ExtensionNameSchema.pipe(
    Schema.annotateKey({ messageMissingKey: "subagent name is required" }),
    Schema.annotate({
      description:
        "Short name for this subagent within its owner namespace. Combined with owner, forms the FQN @owner/subagents/<name>.",
    }),
  ),
}).annotate({
  identifier: "SubagentManifest",
  title: "Subagent Manifest",
  description:
    "Extension manifest file for subagent. Carries the registry-facing identity, version, and metadata.",
});

/**
 * Inferred type for SubagentManifest schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SubagentManifest = Schema.Schema.Type<typeof SubagentManifestSchema>;
