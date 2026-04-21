/**
 * `skill/frontmatter-parseable` — SKILL.md frontmatter parses as a YAML
 * mapping.
 *
 * Cascade (reports the first failure in the order below; later arms
 * short-circuit):
 *
 * 1. SKILL.md begins with `---` at byte 0 (no BOM, no leading whitespace, no
 *    leading HTML comment). This is the arm that caught the
 *    `@agentxm/skills/axm` regression — an HTML comment preceded the
 *    frontmatter delimiter, so YAML parsers silently treated the content as
 *    body.
 * 2. Frontmatter YAML parses without error.
 * 3. Parsed frontmatter is a mapping (not a list, not a scalar).
 *
 * Presence is handled by `skill/skill-md-present`; this rule early-returns
 * `[]` when `SKILL.md` is absent.
 *
 * Advisory-only — the cascade mixes one mechanically-fixable arm
 * (strip-leading-bytes) with arms requiring human judgment (fix YAML
 * syntax). Per `docs/design/lint-engine.md §10.skill (Notes)`, splitting by
 * kind or adding a byte-range mutation Operation is deferred until a second
 * mechanical arm justifies it.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import YAML from "yaml";
import type { SkillRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";

const RULE_ID = "skill/frontmatter-parseable";
const SKILL_MD = "SKILL.md";
const DELIMITER = "---";
// U+FEFF — UTF-8 BOM as a single code point. Escape form so the editor /
// formatter can't silently strip the literal.
const UTF8_BOM = "\uFEFF";

// `ignoreBOM: true` here means "pass the BOM through to the decoded string,
// don't strip it" — cascade arm 1 must see the BOM to flag it.
const decoder = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true });

export const frontmatterParseableRule: AdvisoryRule<SkillRuleContext> = {
  id: RULE_ID,
  description: "SKILL.md frontmatter parses as a YAML mapping.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const exists = yield* context.files.exists(SKILL_MD);
      if (!exists) {
        // Presence is covered by `skill/skill-md-present`.
        return [];
      }
      const bytesResult = yield* context.files.readBytes(SKILL_MD).pipe(
        Effect.map((bytes) => ({ kind: "ok" as const, bytes })),
        // Treat read errors the same as absence — presence rule already owns
        // that path. If `exists` said true but read fails, the cascade can't
        // run anyway; silence here keeps the finding count at one.
        Effect.catch(() => Effect.succeed({ kind: "none" as const })),
      );
      if (bytesResult.kind === "none") {
        return [];
      }
      const content = decoder.decode(bytesResult.bytes);
      return evaluateCascade(content);
    }),
};

// -----------------------------------------------------------------------------
// Cascade
// -----------------------------------------------------------------------------

const evaluateCascade = (content: string): ReadonlyArray<AdvisoryFinding> => {
  const leading = detectLeadingBytes(content);
  if (leading !== undefined) {
    return [leading];
  }
  const parsed = parseFrontmatterYaml(content);
  if (parsed === undefined) {
    // No frontmatter block. Treat as bad (cascade arm 1 "begins with ---"
    // already handled the "literally no ---" case; reaching here means the
    // delimiter was found but the closing delimiter is missing).
    return [
      finding(
        "SKILL.md frontmatter is malformed: opening `---` found but closing `---` is missing.",
        ["Add a closing `---` after the frontmatter YAML block."],
      ),
    ];
  }
  if (parsed.kind === "parse-error") {
    return [
      finding(`SKILL.md frontmatter YAML is invalid: ${parsed.message}`, [
        "Fix YAML syntax at the referenced location.",
      ]),
    ];
  }
  if (!isMapping(parsed.value)) {
    return [
      finding(
        "SKILL.md frontmatter must be a YAML mapping (key: value pairs), not a list or scalar.",
        ["Rewrite the frontmatter block as `key: value` pairs."],
      ),
    ];
  }
  return [];
};

// -----------------------------------------------------------------------------
// Arm 1: leading bytes before `---`
// -----------------------------------------------------------------------------

const detectLeadingBytes = (content: string): AdvisoryFinding | undefined => {
  if (content.startsWith(UTF8_BOM)) {
    return finding(
      "SKILL.md begins with a UTF-8 BOM; frontmatter `---` must appear at byte 0.",
      ["Strip the UTF-8 BOM from the start of SKILL.md."],
      { line: 1 },
    );
  }
  if (content.startsWith(DELIMITER)) {
    return undefined;
  }
  // Any non-`---` leading content is a cascade-arm-1 violation. Detect the
  // common HTML-comment case explicitly so the finding message is clear.
  if (/^\s*<!--/.test(content)) {
    return finding(
      "SKILL.md begins with an HTML comment before the frontmatter `---`; the delimiter must appear at byte 0.",
      ["Strip leading bytes before the first `---`."],
      { line: 1 },
    );
  }
  return finding(
    "SKILL.md frontmatter `---` must appear at byte 0; leading whitespace or other content is not allowed.",
    ["Strip leading bytes before the first `---`."],
    { line: 1 },
  );
};

// -----------------------------------------------------------------------------
// Arms 2 + 3: YAML parse + mapping check
// -----------------------------------------------------------------------------

type ParseResult =
  | { readonly kind: "parsed"; readonly value: unknown }
  | { readonly kind: "parse-error"; readonly message: string };

const parseFrontmatterYaml = (content: string): ParseResult | undefined => {
  // content starts with `---` (arm 1 guaranteed). Find closing delimiter on a
  // new line.
  const afterOpening = content.indexOf("\n");
  if (afterOpening === -1) {
    return undefined;
  }
  const closingIndex = content.indexOf(`\n${DELIMITER}`, afterOpening);
  if (closingIndex === -1) {
    return undefined;
  }
  const yamlContent = content.slice(afterOpening + 1, closingIndex);
  try {
    // YAML.parse returns `null | undefined` for empty input; we care about
    // shape, not emptiness at this arm.
    const value: unknown = YAML.parse(yamlContent);
    return { kind: "parsed", value };
  } catch (error) {
    return {
      kind: "parse-error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
};

const isMapping = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// -----------------------------------------------------------------------------
// Finding helpers
// -----------------------------------------------------------------------------

const finding = (
  message: string,
  suggestions: ReadonlyArray<string>,
  position?: { readonly line?: number; readonly column?: number },
): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message,
  suggestions,
  location: {
    file: SKILL_MD,
    ...(position?.line !== undefined ? { line: position.line } : {}),
    ...(position?.column !== undefined ? { column: position.column } : {}),
  },
});
