/**
 * Subagent content file module for subagent content parsing and frontmatter schemas.
 *
 * Defines the frontmatter schema for subagent content files and a parser that
 * combines the shared frontmatter utility with subagent-specific validation.
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
 * Schema for subagent content frontmatter fields.
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
  description: "YAML frontmatter fields for subagent content files.",
});

/**
 * Inferred type for SubagentFrontmatter schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SubagentFrontmatter = Schema.Schema.Type<typeof SubagentFrontmatterSchema>;

/**
 * Result of parsing a subagent content file.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SubagentContentResult {
  /** Parsed and validated frontmatter. */
  readonly frontmatter: Option.Option<SubagentFrontmatter>;
  /** Content body after the frontmatter block, or full content if no frontmatter. */
  readonly body: string;
}

/**
 * Parse a subagent content file into validated frontmatter and body.
 *
 * Delegates to the shared frontmatter parser, then validates the
 * frontmatter against `SubagentFrontmatterSchema`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const parseSubagentMd = (
  content: string,
  expectedName: string,
): Effect.Effect<SubagentContentResult, AppError> =>
  Effect.gen(function* () {
    const parsed: FrontmatterResult = yield* parseFrontmatterEffect(content);

    if (parsed.frontmatter === undefined) {
      return yield* makeAppError({
        code: "SUBAGENT_FRONTMATTER_MISSING",
        what: `Missing subagent frontmatter for "${expectedName}"`,
        howToFix: `Add YAML frontmatter with name: ${expectedName}.`,
      });
    }

    const frontmatter = yield* Effect.try({
      try: () => Schema.decodeUnknownSync(SubagentFrontmatterSchema)(parsed.frontmatter),
      catch: (error) =>
        makeAppError({
          code: "SUBAGENT_FRONTMATTER_INVALID",
          what: "Invalid subagent frontmatter",
          details: [error instanceof Error ? error.message : String(error)],
          howToFix: "Check the frontmatter fields in your subagent content file.",
          cause: error,
        }),
    });

    if (frontmatter.name !== expectedName) {
      return yield* makeAppError({
        code: "SUBAGENT_NAME_MISMATCH",
        what: `Subagent frontmatter name "${frontmatter.name}" does not match expected name "${expectedName}"`,
        details: [
          `Expected frontmatter name: ${expectedName}`,
          `Actual frontmatter name: ${frontmatter.name}`,
        ],
        howToFix: `Set subagent.json name, frontmatter name, and filename to ${expectedName}.`,
      });
    }

    return { frontmatter: Option.some(frontmatter), body: parsed.body };
  });
