/**
 * Skill content file module for SKILL.md parsing and frontmatter schemas.
 *
 * Defines the frontmatter schema for SKILL.md files and a parser that
 * combines the shared frontmatter utility with skill-specific validation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import * as Record from "effect/Record";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { parseFrontmatterSync } from "../extensions/frontmatter.js";
import type { Skill } from "./types.js";

const NonEmptyTrimmedStringSchema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((input) =>
      input.trim().length > 0 ? undefined : "Expected a non-empty string",
    ),
  ),
);

/**
 * Schema for SKILL.md frontmatter fields.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillFrontmatterSchema = Schema.Struct({
  name: NonEmptyTrimmedStringSchema.pipe(
    Schema.annotateKey({ messageMissingKey: "skill name is required in SKILL.md frontmatter" }),
  ),
  description: NonEmptyTrimmedStringSchema.pipe(
    Schema.annotateKey({
      messageMissingKey: "skill description is required in SKILL.md frontmatter",
    }),
  ),
  metadata: Schema.optionalKey(Schema.Unknown),
}).annotate({
  identifier: "SkillFrontmatter",
  title: "Skill Frontmatter",
  description: "Metadata at the top of a SKILL.md file — must include a name and description.",
});

const decodeMetadata = Schema.decodeUnknownResult(Schema.Record(Schema.String, Schema.Unknown));

/**
 * Parse a SKILL.md file's content and extract skill metadata from frontmatter.
 *
 * Returns `Option.some(Skill)` when the file has valid YAML frontmatter with
 * non-empty `name` and `description` fields. Returns `Option.none()` for any
 * invalid input: missing frontmatter, invalid YAML, or missing/empty required fields.
 */
export const parseSkillMd = (content: string): Option.Option<Skill> => {
  try {
    const parsed = parseFrontmatterSync(content);

    if (parsed.frontmatter === undefined) {
      return Option.none();
    }

    const frontmatter = Result.match(
      Schema.decodeUnknownResult(SkillFrontmatterSchema)(parsed.frontmatter),
      {
        onFailure: () => undefined,
        onSuccess: (validated) => validated,
      },
    );
    if (frontmatter === undefined) {
      return Option.none();
    }

    const metadata: Option.Option<Record.ReadonlyRecord<string, unknown>> =
      frontmatter.metadata === undefined
        ? Option.none()
        : Result.match(decodeMetadata(frontmatter.metadata), {
            onFailure: () => Option.none(),
            onSuccess: (value) => Option.some(value),
          });

    return Option.some({
      name: frontmatter.name,
      description: frontmatter.description,
      metadata,
    });
  } catch {
    // Invalid YAML or other parsing errors — silently skip
    return Option.none();
  }
};
