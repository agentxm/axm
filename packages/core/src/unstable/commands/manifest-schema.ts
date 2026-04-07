/**
 * Command manifest schema definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { CommonManifestBaseFields, ExtensionNameSchema } from "../extensions/common.js";

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
 * Commands provide executable CLI functionality that can be
 * registered and invoked through the AXM CLI.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const CommandManifestSchema = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  ...CommonManifestBaseFields,
  type: Schema.Literal("command"),
  name: ExtensionNameSchema.pipe(
    Schema.annotateKey({ messageMissingKey: "command name is required" }),
  ),
}).annotate({
  identifier: "CommandManifest",
  title: "Command Manifest",
  description: "Configuration file (command.json) that defines a CLI command extension.",
});

/**
 * Inferred type for CommandManifest schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type CommandManifest = Schema.Schema.Type<typeof CommandManifestSchema>;
