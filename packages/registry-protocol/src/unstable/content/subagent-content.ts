/**
 * Subagent content file module for subagent content parsing.
 *
 * The content file's YAML frontmatter is largely free-form: only `name` is
 * required and validated. `agentOverrides`, when present, is recognized for
 * use in per-agent rendering. Any other frontmatter keys flow through
 * verbatim to the agent-native file produced by the renderer.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { parseFrontmatterEffect, type FrontmatterResult } from "./frontmatter.js";

/**
 * Typed failure produced while parsing a subagent content file. Application
 * layers translate this into their own error vocabulary.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class SubagentContentError extends Data.TaggedError("SubagentContentError")<{
  readonly reason:
    "frontmatter-parse" | "missing-frontmatter" | "invalid-frontmatter" | "name-mismatch";
  readonly detail: string;
  readonly suggestion?: string;
  readonly cause?: unknown;
}> {}

/**
 * Map of agent-id → merge patch applied during per-agent rendering.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SubagentAgentOverrides = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

/**
 * Schema for the only required frontmatter field — `name`.
 *
 * Used to validate that `name` is present and a string. The full frontmatter
 * map is preserved verbatim and surfaced as `frontmatter`.
 */
const NameOnlySchema = Schema.Struct({
  name: Schema.String,
}).annotate({
  identifier: "SubagentFrontmatterName",
  description: "Required `name` field for subagent frontmatter.",
});

/**
 * Result of parsing a subagent content file.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SubagentContentResult {
  /** The full frontmatter map, opaque except for `name`. Empty when no frontmatter. */
  readonly frontmatter: Option.Option<Readonly<Record<string, unknown>>>;
  /** The `agentOverrides` map keyed by agent id, when present and structurally valid. */
  readonly agentOverrides: Option.Option<SubagentAgentOverrides>;
  /** Content body after the frontmatter block, or full content if no frontmatter. */
  readonly body: string;
}

const isPlainObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const extractAgentOverrides = (
  fm: Readonly<Record<string, unknown>>,
): Option.Option<SubagentAgentOverrides> => {
  const raw = fm["agentOverrides"];
  if (!isPlainObject(raw)) return Option.none();
  const out: Record<string, Readonly<Record<string, unknown>>> = {};
  for (const [agentId, patch] of Object.entries(raw)) {
    if (isPlainObject(patch)) out[agentId] = patch;
  }
  return Option.some(out);
};

/**
 * Parse a subagent content file into validated frontmatter and body.
 *
 * Validates only that frontmatter is present and that its `name` matches
 * the expected name. All other keys are preserved verbatim.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const parseSubagentMd = (
  content: string,
  expectedName: string,
): Effect.Effect<SubagentContentResult, SubagentContentError> =>
  Effect.gen(function* () {
    const parsed: FrontmatterResult = yield* parseFrontmatterEffect(content).pipe(
      Effect.mapError(
        (cause) =>
          new SubagentContentError({
            reason: "frontmatter-parse",
            detail: "YAML frontmatter could not be parsed",
            suggestion: "Ensure the frontmatter block contains valid YAML between --- delimiters.",
            cause,
          }),
      ),
    );

    if (parsed.frontmatter === undefined) {
      return yield* new SubagentContentError({
        reason: "missing-frontmatter",
        detail: `Missing subagent frontmatter for "${expectedName}"`,
        suggestion: `Add YAML frontmatter with name: ${expectedName}.`,
      });
    }

    yield* Effect.try({
      try: () => Schema.decodeUnknownSync(NameOnlySchema)(parsed.frontmatter),
      catch: (error) =>
        new SubagentContentError({
          reason: "invalid-frontmatter",
          detail: "Invalid subagent frontmatter",
          suggestion: "Frontmatter must include a string `name` field.",
          cause: error,
        }),
    });

    if (!isPlainObject(parsed.frontmatter)) {
      return yield* new SubagentContentError({
        reason: "invalid-frontmatter",
        detail: "Subagent frontmatter must be a YAML mapping",
        suggestion: `Add YAML frontmatter with name: ${expectedName}.`,
      });
    }

    const fm = parsed.frontmatter;
    const name = fm["name"];

    if (name !== expectedName) {
      return yield* new SubagentContentError({
        reason: "name-mismatch",
        detail: `Subagent frontmatter name "${String(name)}" does not match expected name "${expectedName}"`,
        suggestion: `Set subagent.json name, frontmatter name, and filename to ${expectedName}.`,
      });
    }

    return {
      frontmatter: Option.some(fm),
      agentOverrides: extractAgentOverrides(fm),
      body: parsed.body,
    };
  });
