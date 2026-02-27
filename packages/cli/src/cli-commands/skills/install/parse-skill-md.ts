/**
 * SKILL.md frontmatter parser.
 *
 * Parses YAML frontmatter from SKILL.md files to extract skill metadata.
 *
 * @experimental This API is unstable and may change without notice.
 */

import matter from "gray-matter";
import * as Either from "effect/Either";
import * as Option from "effect/Option";
import * as Record from "effect/Record";
import * as Schema from "effect/Schema";
import type { Skill } from "../../../extensions/skills/types.js";

const MetadataSchema = Schema.Record({ key: Schema.String, value: Schema.Unknown });

/**
 * Parse a SKILL.md file's content and extract skill metadata from frontmatter.
 *
 * Returns `Option.some(Skill)` when the file has valid YAML frontmatter with
 * non-empty `name` and `description` fields. Returns `Option.none()` for any
 * invalid input: missing frontmatter, invalid YAML, or missing/empty required fields.
 */
export const parseSkillMd = (content: string): Option.Option<Skill> => {
  try {
    const { data } = matter(content);

    const name = data["name"];
    const description = data["description"];
    const rawMetadata = data["metadata"];

    // Require non-empty name
    if (typeof name !== "string" || name.trim() === "") {
      return Option.none();
    }

    // Require non-empty description
    if (typeof description !== "string" || description.trim() === "") {
      return Option.none();
    }

    // Extract optional metadata (validated via Schema)
    const metadata: Option.Option<Record.ReadonlyRecord<string, unknown>> =
      rawMetadata != null
        ? Either.match(Schema.decodeUnknownEither(MetadataSchema)(rawMetadata), {
            onLeft: () => Option.none(),
            onRight: (validated) => Option.some(validated),
          })
        : Option.none();

    return Option.some({
      name,
      description,
      metadata,
    });
  } catch {
    // Invalid YAML or other parsing errors — silently skip
    return Option.none();
  }
};
