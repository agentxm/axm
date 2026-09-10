/**
 * `skill/frontmatter-standard-valid` — SKILL.md metadata conforms to the
 * pinned Agent Skills specification and reference validator.
 *
 * Parsing failures are owned by `skill/frontmatter-parseable`; this rule
 * returns no findings until the frontmatter is a YAML mapping.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import YAML from "yaml";
import { validateSkillFrontmatter } from "../../../content/skill-content.js";
import type { SkillRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";

const RULE_ID = "skill/frontmatter-standard-valid";
const SKILL_MD = "SKILL.md";
const decoder = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true });

const parseFrontmatterMapping = (content: string): unknown | undefined => {
  if (!content.startsWith("---")) return undefined;
  const openingEnd = content.indexOf("\n");
  if (openingEnd === -1) return undefined;
  const closingStart = content.indexOf("\n---", openingEnd);
  if (closingStart === -1) return undefined;
  try {
    const parsed: unknown = YAML.parse(content.slice(openingEnd + 1, closingStart));
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
};

const finding = (message: string): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message,
  location: { file: SKILL_MD, line: 1 },
});

export const frontmatterStandardValidRule: AdvisoryRule<SkillRuleContext> = {
  id: RULE_ID,
  description: "SKILL.md metadata conforms to the pinned Agent Skills standard.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const exists = yield* context.files.exists(SKILL_MD);
      if (!exists) return [];
      const content = yield* context.files.readBytes(SKILL_MD).pipe(
        Effect.map((bytes) => decoder.decode(bytes)),
        Effect.catch(() => Effect.succeed(undefined)),
      );
      if (content === undefined) return [];
      const parsed = parseFrontmatterMapping(content);
      if (parsed === undefined) return [];
      const validation = validateSkillFrontmatter(parsed, context.subject.expectedName);
      return validation.valid ? [] : validation.errors.map(finding);
    }),
};
