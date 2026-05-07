/**
 * Command argument schema definition.
 *
 * Defines the shape of arguments that a command accepts, used in the command
 * content file's frontmatter (`${name}.md`).
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";

/**
 * Schema for a single command argument.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const CommandArgumentSchema = Schema.Struct({
  name: Schema.String.pipe(Schema.annotateKey({ messageMissingKey: "argument name is required" })),
  description: Schema.optional(Schema.String),
  required: Schema.optional(Schema.Boolean),
  default: Schema.optional(Schema.String),
}).annotate({
  identifier: "CommandArgument",
  title: "Command Argument",
  description: "A single argument that a command accepts.",
});

/**
 * Inferred type for CommandArgument schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type CommandArgument = Schema.Schema.Type<typeof CommandArgumentSchema>;
