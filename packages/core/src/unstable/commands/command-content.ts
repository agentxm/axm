/**
 * Command content file module for COMMAND.md parsing and frontmatter schemas.
 *
 * Defines the frontmatter schema for COMMAND.md files, a parser that
 * combines the shared frontmatter utility with command-specific validation,
 * and a transformation for syncing frontmatter fields to manifest fields.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { CommandArgumentSchema } from "./command-argument.js";
import { parseFrontmatterEffect, type FrontmatterResult } from "../extensions/frontmatter.js";
import { makeAppError, type AppError } from "../app-error/index.js";

/**
 * Schema for COMMAND.md frontmatter fields.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const CommandFrontmatterSchema = Schema.Struct({
  description: Schema.optional(Schema.String),
  model: Schema.optional(Schema.NullOr(Schema.String)),
  allowedTools: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  isolatedContext: Schema.optional(Schema.Boolean),
  arguments: Schema.optional(Schema.Array(CommandArgumentSchema)),
  argumentHint: Schema.optional(Schema.String),
  autoInvocable: Schema.optional(Schema.Boolean),
  userInvocable: Schema.optional(Schema.Boolean),
}).annotate({
  identifier: "CommandFrontmatter",
  title: "Command Frontmatter",
  description: "YAML frontmatter fields for COMMAND.md files.",
});

/**
 * Inferred type for CommandFrontmatter schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type CommandFrontmatter = Schema.Schema.Type<typeof CommandFrontmatterSchema>;

/**
 * Result of parsing a COMMAND.md file.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface CommandContentResult {
  /** Parsed and validated frontmatter, or Option.none() if no frontmatter block was found. */
  readonly frontmatter: Option.Option<CommandFrontmatter>;
  /** Content body after the frontmatter block, or full content if no frontmatter. */
  readonly body: string;
}

/**
 * Parse a COMMAND.md file's content into validated frontmatter and body.
 *
 * Delegates to the shared frontmatter parser, then validates the
 * frontmatter against `CommandFrontmatterSchema`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const parseCommandMd = (content: string): Effect.Effect<CommandContentResult, AppError> =>
  Effect.gen(function* () {
    const parsed: FrontmatterResult = yield* parseFrontmatterEffect(content);

    if (parsed.frontmatter === undefined) {
      return { frontmatter: Option.none(), body: parsed.body };
    }

    const frontmatter = yield* Effect.try({
      try: () => Schema.decodeUnknownSync(CommandFrontmatterSchema)(parsed.frontmatter),
      catch: (error) =>
        makeAppError({
          code: "COMMAND_FRONTMATTER_INVALID",
          what: "Invalid COMMAND.md frontmatter",
          details: [error instanceof Error ? error.message : String(error)],
          howToFix: "Check the frontmatter fields in your COMMAND.md file.",
          cause: error,
        }),
    });

    return { frontmatter: Option.some(frontmatter), body: parsed.body };
  });

/**
 * Schema for manifest fields projected from frontmatter.
 *
 * Used during publish to sync description and model from COMMAND.md
 * frontmatter into the command manifest.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ManifestFieldsFromFrontmatterSchema = Schema.Struct({
  description: Schema.optional(Schema.String),
  model: Schema.optional(Schema.NullOr(Schema.String)),
}).annotate({
  identifier: "ManifestFieldsFromFrontmatter",
  title: "Manifest Fields from Frontmatter",
  description: "Fields projected from COMMAND.md frontmatter to command manifest.",
});

/**
 * Inferred type for ManifestFieldsFromFrontmatter.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ManifestFieldsFromFrontmatter = Schema.Schema.Type<
  typeof ManifestFieldsFromFrontmatterSchema
>;

/**
 * Project frontmatter fields to manifest fields.
 *
 * Extracts `description` and `model` from a parsed `CommandFrontmatter`
 * for use in manifest updates.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const projectFrontmatterToManifest = (
  frontmatter: CommandFrontmatter,
): ManifestFieldsFromFrontmatter => ({
  description: frontmatter.description,
  model: frontmatter.model,
});
