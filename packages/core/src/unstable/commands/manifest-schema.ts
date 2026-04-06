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
export const COMMAND_MANIFEST_FILENAME = "axm-command.json";

/**
 * Schema for command manifest files (axm-command.json).
 *
 * Commands provide executable CLI functionality that can be
 * registered and invoked through the AXM CLI.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const CommandManifestSchema = Schema.Struct({
  ...CommonManifestBaseFields,
  type: Schema.Literal("command"),
  name: ExtensionNameSchema,
});

/**
 * Inferred type for CommandManifest schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type CommandManifest = Schema.Schema.Type<typeof CommandManifestSchema>;
