/**
 * Command manifest schema definition.
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
 * Filename for command manifest files.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const COMMAND_MANIFEST_FILENAME = "command.json";

/**
 * URL for the command manifest JSON Schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const COMMAND_MANIFEST_SCHEMA_URL = "https://axm.sh/schemas/command.schema.json";

/**
 * Schema for command manifest files (command.json).
 *
 * Commands provide registry-facing identity, version, and metadata. Fields
 * like `model` and `agentOverrides` live in the content file's frontmatter.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const CommandManifestSchema = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  ...CommonManifestBaseFields,
  ...NonPackManifestFields,
  type: Schema.Literal("command"),
  name: ExtensionNameSchema.pipe(
    Schema.annotateKey({ messageMissingKey: "command name is required" }),
    Schema.annotate({
      description:
        "Short name for this command within its owner namespace. Combined with owner, forms the FQN @owner/commands/<name>.",
    }),
  ),
}).annotate({
  identifier: "CommandManifest",
  title: "Command Manifest",
  description:
    "Extension manifest file for slash-command. Carries registry-facing identity, version, and metadata. Per-agent frontmatter overrides live in the content file.",
});

/**
 * Inferred type for CommandManifest schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type CommandManifest = Schema.Schema.Type<typeof CommandManifestSchema>;
