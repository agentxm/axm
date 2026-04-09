/**
 * Subagent content file module for SUBAGENT.md parsing and frontmatter schemas.
 *
 * Defines the frontmatter schema for SUBAGENT.md files, a parser that
 * combines the shared frontmatter utility with subagent-specific validation,
 * and a transformation for syncing frontmatter fields to manifest fields.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { parseFrontmatterEffect, type FrontmatterResult } from "../extensions/frontmatter.js";
import { makeAppError, type AppError } from "../app-error/index.js";
import { ToolAccessLevelSchema } from "./tool-access.js";

/**
 * Schema for SUBAGENT.md frontmatter fields.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SubagentFrontmatterSchema = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  model: Schema.optional(Schema.String),
  toolAccess: Schema.optional(ToolAccessLevelSchema),
  background: Schema.optional(Schema.Boolean),
  overrides: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
}).annotate({
  identifier: "SubagentFrontmatter",
  title: "Subagent Frontmatter",
  description: "YAML frontmatter fields for SUBAGENT.md files.",
});

/**
 * Inferred type for SubagentFrontmatter schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SubagentFrontmatter = Schema.Schema.Type<typeof SubagentFrontmatterSchema>;

/**
 * Result of parsing a SUBAGENT.md file.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SubagentContentResult {
  /** Parsed and validated frontmatter, or Option.none() if no frontmatter block was found. */
  readonly frontmatter: Option.Option<SubagentFrontmatter>;
  /** Content body after the frontmatter block, or full content if no frontmatter. */
  readonly body: string;
}

/**
 * Parse a SUBAGENT.md file's content into validated frontmatter and body.
 *
 * Delegates to the shared frontmatter parser, then validates the
 * frontmatter against `SubagentFrontmatterSchema`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const parseSubagentMd = (content: string): Effect.Effect<SubagentContentResult, AppError> =>
  Effect.gen(function* () {
    const parsed: FrontmatterResult = yield* parseFrontmatterEffect(content);

    if (parsed.frontmatter === undefined) {
      return { frontmatter: Option.none(), body: parsed.body };
    }

    const frontmatter = yield* Effect.try({
      try: () => Schema.decodeUnknownSync(SubagentFrontmatterSchema)(parsed.frontmatter),
      catch: (error) =>
        makeAppError({
          code: "SUBAGENT_FRONTMATTER_INVALID",
          what: "Invalid SUBAGENT.md frontmatter",
          details: [error instanceof Error ? error.message : String(error)],
          howToFix: "Check the frontmatter fields in your SUBAGENT.md file.",
          cause: error,
        }),
    });

    return { frontmatter: Option.some(frontmatter), body: parsed.body };
  });

/**
 * Schema for manifest fields projected from frontmatter.
 *
 * Used during publish to sync description, model, toolAccess, and background
 * from SUBAGENT.md frontmatter into the subagent manifest.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ManifestFieldsFromFrontmatterSchema = Schema.Struct({
  description: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  toolAccess: Schema.optional(ToolAccessLevelSchema),
  background: Schema.optional(Schema.Boolean),
}).annotate({
  identifier: "SubagentManifestFieldsFromFrontmatter",
  title: "Subagent Manifest Fields from Frontmatter",
  description: "Fields projected from SUBAGENT.md frontmatter to subagent manifest.",
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
 * Extracts `description`, `model`, `toolAccess`, and `background` from a
 * parsed `SubagentFrontmatter` for use in manifest updates.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const projectFrontmatterToManifest = (
  frontmatter: SubagentFrontmatter,
): ManifestFieldsFromFrontmatter => ({
  description: frontmatter.description,
  model: frontmatter.model,
  toolAccess: frontmatter.toolAccess,
  background: frontmatter.background,
});
