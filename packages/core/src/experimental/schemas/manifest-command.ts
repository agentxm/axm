/**
 * Command manifest schema definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { Schema } from "effect";
import { CommonManifestFields } from "./common";

/**
 * Schema for command manifest files (axm-command.json).
 *
 * Commands provide executable CLI functionality that can be
 * registered and invoked through the AXM CLI.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const CommandManifestSchema = Schema.Struct({
  ...CommonManifestFields,
});

/**
 * Inferred type for CommandManifest schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type CommandManifest = typeof CommandManifestSchema.Type;
