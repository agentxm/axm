/**
 * Command content file module — parsing and frontmatter schemas for the
 * `${name}.md` content file.
 *
 * Defines the frontmatter schema, a parser that combines the shared
 * frontmatter utility with command-specific validation, and a transformation
 * for syncing frontmatter fields to manifest fields.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { parseFrontmatterEffect, type FrontmatterResult } from "../extensions/frontmatter.js";
import { makeAppError, type AppError } from "../app-error/index.js";

/**
 * Schema for command content file frontmatter fields.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const CommandFrontmatterSchema = Schema.Record(Schema.String, Schema.Unknown).annotate({
  identifier: "CommandFrontmatter",
  title: "Command Frontmatter",
  description: "Opaque YAML frontmatter fields for command content files.",
});

/**
 * Inferred type for CommandFrontmatter schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type CommandFrontmatter = Schema.Schema.Type<typeof CommandFrontmatterSchema>;

/**
 * Result of parsing a command content file.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface CommandContentResult {
  /** Parsed and validated frontmatter, or Option.none() if no frontmatter block was found. */
  readonly frontmatter: Option.Option<CommandFrontmatter>;
  /** Content body after the frontmatter block, or full content if no frontmatter. */
  readonly body: string;
}

const isPlainObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Parse a command content file into validated frontmatter and body.
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

    if (!isPlainObject(parsed.frontmatter)) {
      return yield* makeAppError({
        code: "COMMAND_FRONTMATTER_INVALID",
        category: "validation",
        message: "Command frontmatter must be a YAML mapping",
        breadcrumbs: [
          {
            task: "Recover",
            description: "Use key-value YAML frontmatter in your command content file.",
          },
        ],
      });
    }

    return { frontmatter: Option.some(parsed.frontmatter), body: parsed.body };
  });

/**
 * Schema for manifest fields projected from frontmatter.
 *
 * Used during publish to sync description and model from the command content
 * file's frontmatter into the command manifest.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ManifestFieldsFromFrontmatterSchema = Schema.Struct({
  description: Schema.optional(Schema.String),
  model: Schema.optional(Schema.NullOr(Schema.String)),
}).annotate({
  identifier: "ManifestFieldsFromFrontmatter",
  title: "Manifest Fields from Frontmatter",
  description: "Fields projected from command content frontmatter to command manifest.",
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
): ManifestFieldsFromFrontmatter => {
  const description = frontmatter["description"];
  const model = frontmatter["model"];

  return {
    description: typeof description === "string" ? description : undefined,
    model: typeof model === "string" || model === null ? model : undefined,
  };
};
